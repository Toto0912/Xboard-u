<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Models\User;
use App\Protocols\ClashMeta;
use App\Protocols\SingBox;
use App\Protocols\Stash;
use App\Support\ServerTransport;
use App\Services\ServerService;
use App\Services\NodeRegistry;
use App\WebSocket\NodeEventHandlers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Workerman\Connection\TcpConnection;
use Tests\TestCase;

final class Hysteria2PortHoppingTest extends TestCase
{
    use RefreshDatabase;

    private function url(): string { return '/api/v2/'.hash('crc32b',config('app.key')).'/server/manage'; }

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::create(['uuid'=>'7f894d8b-0d1c-4612-a901-b1475c06f513','token'=>str_repeat('a',32),'email'=>'hop@example.test','password'=>bcrypt('test-only'),'is_admin'=>true]));
        admin_setting(['server_ws_enable'=>0,'server_token'=>'hop-server-token']);
    }

    private function payload(): array
    {
        return ['name'=>'hy2-hop','type'=>'hysteria','host'=>'edge.example.test','port'=>'60000-65000','server_port'=>'60000-65000','rate'=>1,
            'protocol_settings'=>['version'=>2,'hop_interval'=>'10-30','tls'=>['server_name'=>'edge.example.test'],'obfs'=>['open'=>false],'bandwidth'=>['up'=>23,'down'=>47]]];
    }

    public function test_range_roundtrip_single_and_machine_payload_and_interval_only_update(): void
    {
        $payload=$this->payload();
        $machine=ServerMachine::create(['name'=>'hop-machine','token'=>'hop-machine-token','is_active'=>true]);
        $payload['machine_id']=$machine->id;
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $node=Server::latest('id')->firstOrFail();
        $this->assertSame(60000,(int)$node->getRawOriginal('server_port'));
        $this->assertSame('60000-65000',$node->protocol_settings['hy2_settings']['port_range']);
        $this->assertSame(10,$node->protocol_settings['hop_interval']);
        $this->assertSame(30,$node->protocol_settings['hop_interval_max']);
        $single=$this->getJson('/api/v2/server/config?token=hop-server-token&node_id='.$node->id)->assertOk();
        $single->assertJsonPath('server_port',60000)->assertJsonPath('hy2_settings.port_range','60000-65000');
        $machineResponse=$this->getJson('/api/v2/server/config?token=hop-machine-token&machine_id='.$machine->id.'&node_id='.$node->id)->assertOk();
        $this->assertSame($single->json(),$machineResponse->json());
        $before=ServerService::buildNodeConfig($node);
        $payload['id']=$node->id;
        $payload['protocol_settings']['hop_interval']='20-40';
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $this->assertSame($before,ServerService::buildNodeConfig($node->fresh()));
        $payload['server_port']=443;
        $payload['protocol_settings']['hop_interval']=15;
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $node=$node->fresh();
        $this->assertSame(443,(int)$node->server_port);
        $this->assertArrayNotHasKey('port_range',$node->protocol_settings['hy2_settings']);
        $this->assertNull($node->protocol_settings['hop_interval_max']);
        $this->assertSame('60000-65000',$node->port);
    }

    public function test_cdn_uses_its_own_range_and_client_interval_is_not_a_server_setting(): void
    {
        $payload=$this->payload();
        $payload['cdn_settings']=['enabled'=>true,'type'=>'hysteria','server'=>['host'=>'origin.example.test','port'=>'50000-55000','server_port'=>'50000-55000','protocol_settings'=>$payload['protocol_settings']]];
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $node=Server::latest('id')->firstOrFail();
        $this->assertSame(60000,(int)$node->server_port);
        $config=ServerService::buildNodeConfig($node);
        $this->assertSame(50000,$config['server_port']);
        $this->assertSame('50000-55000',$config['hy2_settings']['port_range']);
        $this->assertSame(47,$config['up_mbps']);
        $this->assertArrayNotHasKey('hop_interval',$config);
        $client=ServerTransport::clientPayload($node->makeVisible('cdn_settings')->toArray());
        $this->assertSame('60000-65000',$client['ports']);
        $this->assertArrayNotHasKey('hy2_settings',$client['protocol_settings']);
        $this->assertArrayNotHasKey('cdn_settings',$client);
    }

    public function test_invalid_inputs_are_rejected_without_truncation(): void
    {
        foreach ([
            ['port','65000-60000'],['port','60000,60001'],['port','65536'],['server_port','0'],['server_port','60000-65000;whoami'],
            ['protocol_settings.hop_interval','4'],['protocol_settings.hop_interval','30-10'],['protocol_settings.hop_interval','10.5'],
            ['protocol_settings.hop_interval','999999999999999999999'],['protocol_settings.hop_interval',false],
            ['protocol_settings.hy2_settings.port_range','61000-62000'],
        ] as [$field,$value]) {
            $payload=$this->payload();
            data_set($payload,$field,$value);
            $this->postJson($this->url().'/save',$payload)->assertStatus(422);
        }
        $this->assertSame(0,Server::count());
    }

    public function test_native_subscriptions_random_and_fixed_fallback(): void
    {
        $this->postJson($this->url().'/save',$this->payload())->assertOk();
        $server=ServerTransport::clientPayload(Server::latest('id')->firstOrFail()->toArray());
        $password='7f894d8b-0d1c-4612-a901-b1475c06f513';
        $native=new \ReflectionMethod(SingBox::class,'buildHysteria');
        foreach (['1.10.0','1.12.0','1.14.4'] as $version) {
            $result=$native->invoke(new SingBox([],[],'sing-box',$version),$password,$server);
            if ($version==='1.10.0') {
                $this->assertSame(60000,$result['server_port']);
                $this->assertArrayNotHasKey('server_ports',$result);
            } else {
                $this->assertSame(['60000:65000'],$result['server_ports']);
                $this->assertArrayNotHasKey('server_port',$result);
                $this->assertSame('10s',$result['hop_interval']);
                if ($version==='1.14.4') $this->assertSame('30s',$result['hop_interval_max']);
                else $this->assertArrayNotHasKey('hop_interval_max',$result);
            }
        }
        $mihomo=ClashMeta::buildHysteria($password,$server,[]);
        $stash=Stash::buildHysteria($password,$server);
        $this->assertSame('10-30',$mihomo['hop-interval']);
        $this->assertSame(10,$stash['hop-interval']);
        $this->assertSame('60000-65000',$stash['ports']);
    }

    public function test_empty_optional_hy2_fields_do_not_break_save_or_config_push(): void
    {
        $payload=$this->payload();
        $payload['protocol_settings']['bandwidth']=null;
        $payload['protocol_settings']['tls']=null;
        $payload['protocol_settings']['obfs']=null;
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $node=Server::latest('id')->firstOrFail();
        $config=ServerService::buildNodeConfig($node);
        $this->assertSame(0,$config['up_mbps']);
        $this->assertSame(0,$config['down_mbps']);
        $this->assertNull($config['obfs']);
        $this->assertSame('60000-65000',$config['hy2_settings']['port_range']);
    }

    public function test_websocket_and_etag_include_the_effective_range(): void
    {
        $payload=$this->payload();
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $node=Server::latest('id')->firstOrFail();
        $url='/api/v2/server/config?token=hop-server-token&node_id='.$node->id;
        $etag=$this->getJson($url)->assertOk()->headers->get('ETag');
        foreach ([false,true] as $machine) {
            $messages=[];
            $connection=Mockery::mock(TcpConnection::class);
            if ($machine) $connection->machineNodeIds=[$node->id];
            $connection->shouldReceive('send')->twice()->andReturnUsing(function($body)use(&$messages){$messages[]=json_decode($body,true);return true;});
            NodeRegistry::add($node->id,$connection);
            try {
                NodeEventHandlers::pushFullSync($connection,$node);
                $this->assertSame(60000,$messages[0]['data']['config']['server_port']);
                $this->assertSame('60000-65000',$messages[0]['data']['config']['hy2_settings']['port_range']);
            } finally {NodeRegistry::remove($node->id,$connection);}
        }
        $payload['id']=$node->id;
        $payload['server_port']='60000-64000';
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $updated=$this->getJson($url,['If-None-Match'=>$etag])->assertOk();
        $this->assertNotSame($etag,$updated->headers->get('ETag'));
        $updated->assertJsonPath('hy2_settings.port_range','60000-64000');
    }
}
