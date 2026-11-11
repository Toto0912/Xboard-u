<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Models\User;
use App\Services\ServerService;
use App\Services\NodeRegistry;
use App\WebSocket\NodeEventHandlers;
use App\Protocols\General;
use App\Protocols\ClashMeta;
use App\Protocols\Stash;
use App\Support\Hysteria2Settings;
use App\Support\ServerTransport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Workerman\Connection\TcpConnection;
use Tests\TestCase;

final class Hysteria2SettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::create(['uuid'=>'7f894d8b-0d1c-4612-a901-b1475c06f513','token'=>str_repeat('a',32),'email'=>'hy2@example.test','password'=>bcrypt('test-only'),'is_admin'=>true]));
        admin_setting(['server_ws_enable'=>0,'server_token'=>'hy2-server-token']);
    }

    private function url(): string { return '/api/v2/'.hash('crc32b',config('app.key')).'/server/manage'; }

    private function payload(string $kernel = 'singbox'): array
    {
        return ['name'=>'hy2-test','type'=>'hysteria','host'=>'edge.example.test','port'=>443,'server_port'=>18443,'rate'=>1,'enabled'=>true,
            'protocol_settings'=>['version'=>2,'target_kernel'=>$kernel,'bandwidth'=>['up'=>23,'down'=>47],'tls'=>['server_name'=>'edge.example.test'],'obfs'=>['open'=>false],
                'hy2_settings'=>['kernel'=>$kernel,'masquerade'=>['type'=>'string','content'=>'example-response',($kernel==='xray'?'statusCode':'status_code')=>201,'headers'=>['Content-Type'=>'text/plain']]]]];
    }

    public function test_save_reopen_directions_machine_and_subscription_isolation(): void
    {
        foreach (['singbox','xray'] as $kernel) {
            $payload=$this->payload($kernel);
            $machine=ServerMachine::create(['name'=>'hy2-machine','token'=>'hy2-machine-'.$kernel,'is_active'=>true]);
            $payload['machine_id']=$machine->id;
            $this->postJson($this->url().'/save',$payload)->assertOk();
            $node=Server::latest('id')->firstOrFail();
            $settings=$node->fresh()->protocol_settings;
            $this->assertSame(23,$settings['bandwidth']['up']);
            $this->assertSame(47,$settings['bandwidth']['down']);
            $this->assertSame('example-response',$settings['hy2_settings']['masquerade']['content']);
            $single=$this->getJson('/api/v2/server/config?token=hy2-server-token&node_id='.$node->id)->assertOk();
            $single->assertJsonPath('up_mbps',47)->assertJsonPath('down_mbps',23)->assertJsonPath('hy2_settings.bandwidth_mode','auto');
            $machineResponse=$this->getJson('/api/v2/server/config?token='.$machine->token.'&machine_id='.$machine->id.'&node_id='.$node->id)->assertOk();
            $this->assertSame($single->json(),$machineResponse->json());
            $client=ServerTransport::clientPayload($node->makeVisible('cdn_settings')->toArray());
            $this->assertArrayNotHasKey('hy2_settings',$client['protocol_settings']);
            $this->assertSame(23,$client['protocol_settings']['bandwidth']['up']);
            $this->assertSame(47,$client['protocol_settings']['bandwidth']['down']);
            $payload['id']=$node->id;
            $payload['protocol_settings']['hy2_settings']['masquerade']=[];
            $payload['protocol_settings']['bandwidth']=['up'=>null,'down'=>null];
            $this->postJson($this->url().'/save',$payload)->assertOk();
            $config=ServerService::buildNodeConfig($node->fresh());
            $this->assertSame(0,$config['up_mbps']);$this->assertSame(0,$config['down_mbps']);
            $this->assertArrayNotHasKey('masquerade',$config['hy2_settings']);
        }
    }

    public function test_cdn_uses_inner_masquerade_and_bandwidth_only(): void
    {
        $payload=$this->payload();
        $payload['cdn_settings']=['enabled'=>true,'type'=>'hysteria','server'=>['host'=>'origin.example.test','port'=>443,'server_port'=>29443,'protocol_settings'=>$payload['protocol_settings']]];
        $payload['cdn_settings']['server']['protocol_settings']['bandwidth']=['up'=>31,'down'=>53];
        $payload['cdn_settings']['server']['protocol_settings']['hy2_settings']['masquerade']['content']='inner-response';
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $node=Server::latest('id')->firstOrFail();
        $config=ServerService::buildNodeConfig($node);
        $this->assertSame(53,$config['up_mbps']);$this->assertSame(31,$config['down_mbps']);
        $this->assertSame('inner-response',$config['hy2_settings']['masquerade']['content']);
        $this->assertSame(23,$node->protocol_settings['bandwidth']['up']);
    }

    public function test_invalid_masquerade_is_rejected_instead_of_silently_cleared(): void
    {
        foreach ([['type'=>'proxy','url'=>'file:///etc/passwd'],['type'=>'file','directory'=>''],['type'=>'string','content'=>'ok','status_code'=>-1],['type'=>'string','content'=>'ok','headers'=>['X-Test'=>"a\r\nb"]],['type'=>'proxy','url'=>'https://example.com','rewriteHost'=>true]] as $invalid) {
            $payload=$this->payload();$payload['protocol_settings']['hy2_settings']['masquerade']=$invalid;
            $this->postJson($this->url().'/save',$payload)->assertStatus(422);
        }
        $payload=$this->payload();$payload['protocol_settings']['hy2_settings']['kernel']='xray';
        $this->postJson($this->url().'/save',$payload)->assertStatus(422);
        $this->assertSame(0,Server::count());
    }

    public function test_all_native_masquerade_modes_and_no_manual_quic(): void
    {
        foreach (['singbox','xray'] as $core) {
            foreach (['file','proxy','string'] as $mode) {
                $m=['type'=>$mode];
                if ($mode==='file') {$m[$core==='xray'?'dir':'directory']='/tmp/site';}
                if ($mode==='proxy') {$m['url']='https://example.com';$m[$core==='xray'?'rewriteHost':'rewrite_host']=true;if($core==='xray'){$m['insecure']=false;$m['xForwarded']=false;}}
                if ($mode==='string') {$m['content']='hello';$m[$core==='xray'?'statusCode':'status_code']=200;$m['headers']=['Content-Type'=>$core==='xray'?'text/plain':['text/plain']];}
                $this->assertNull(Hysteria2Settings::error(['target_kernel'=>$core,'hy2_settings'=>['kernel'=>$core,'masquerade'=>$m]]));
            }
        }
        $this->assertNotNull(Hysteria2Settings::error(['hy2_settings'=>['quic'=>['maxIdleTimeout'=>60]]]));
    }

    public function test_websocket_and_etag_follow_effective_server_settings(): void
    {
        $node=Server::create($this->payload());
        $url='/api/v2/server/config?token=hy2-server-token&node_id='.$node->id;
        $etag=$this->getJson($url)->assertOk()->headers->get('ETag');
        foreach ([false,true] as $machineMode) {
            $messages=[];
            $conn=Mockery::mock(TcpConnection::class);
            if ($machineMode) { $conn->machineNodeIds=[$node->id]; }
            $conn->shouldReceive('send')->twice()->andReturnUsing(function($body) use (&$messages) { $messages[]=json_decode($body,true,flags:JSON_THROW_ON_ERROR);return true; });
            NodeRegistry::add($node->id,$conn);
            try {
                NodeEventHandlers::pushFullSync($conn,$node);
                $this->assertSame('sync.config',$messages[0]['event']);
                $this->assertSame(47,$messages[0]['data']['config']['up_mbps']);
                $this->assertSame('example-response',$messages[0]['data']['config']['hy2_settings']['masquerade']['content']);
            } finally { NodeRegistry::remove($node->id,$conn); }
        }
        $payload=$this->payload();$payload['id']=$node->id;
        $payload['protocol_settings']['hy2_settings']['masquerade']['content']='updated-response';
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $response=$this->getJson($url,['If-None-Match'=>$etag])->assertOk();
        $this->assertNotSame($etag,$response->headers->get('ETag'));
        $response->assertJsonPath('hy2_settings.masquerade.content','updated-response');
    }

    public function test_subscriptions_keep_client_bandwidth_and_exclude_masquerade(): void
    {
        $node=Server::create($this->payload());
        $client=ServerTransport::clientPayload([...$node->makeVisible('cdn_settings')->toArray(),'password'=>'test-only']);
        $user=['speed_limit'=>0,'uuid'=>'7f894d8b-0d1c-4612-a901-b1475c06f513'];
        foreach ([General::buildHysteria('test-only',$client),json_encode(ClashMeta::buildHysteria('test-only',$client,$user)),json_encode(Stash::buildHysteria('test-only',$client))] as $output) {
            $this->assertStringNotContainsString('masquerade',$output);
            $this->assertStringNotContainsString('example-response',$output);
            $this->assertStringNotContainsString('bandwidth_mode',$output);
        }
        $meta=ClashMeta::buildHysteria('test-only',$client,$user);
        $this->assertSame(23,$meta['up']);$this->assertSame(47,$meta['down']);
        $converter=new \App\Protocols\SingBox($user,[$client],'sing-box','1.14.4');
        $build=new \ReflectionMethod($converter,'buildHysteria');
        $singbox=$build->invoke($converter,'test-only',$client);
        $this->assertSame(23,$singbox['up_mbps']);$this->assertSame(47,$singbox['down_mbps']);
        $this->assertArrayNotHasKey('masquerade',$singbox);
        $this->assertArrayNotHasKey('hy2_settings',$singbox);
        $payload=$this->payload();$payload['protocol_settings']['version']=1;
        $this->postJson($this->url().'/save',$payload)->assertOk();
        $hy1=Server::latest('id')->firstOrFail();$server=ServerService::buildNodeConfig($hy1);
        $this->assertArrayNotHasKey('hy2_settings',$server);
        $this->assertSame(23,$server['up_mbps']);$this->assertSame(47,$server['down_mbps']);
    }

    public function test_invalid_bandwidth_and_obfs_are_rejected(): void
    {
        foreach ([-1,1.5,1000001,'invalid'] as $rate) {
            $payload=$this->payload();$payload['protocol_settings']['bandwidth']['up']=$rate;
            $this->postJson($this->url().'/save',$payload)->assertStatus(422);
        }
        foreach ([['open'=>true,'type'=>'unknown','password'=>'test'],['open'=>true,'type'=>'salamander','password'=>'']] as $obfs) {
            $payload=$this->payload();$payload['protocol_settings']['obfs']=$obfs;
            $this->postJson($this->url().'/save',$payload)->assertStatus(422);
        }
        $this->assertSame(0,Server::count());
    }
}
