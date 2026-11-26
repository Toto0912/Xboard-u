import type { ServerProtocolType, TargetKernel } from '@/api/serverNode';

export interface ProtocolMeta {
  type: ServerProtocolType;
  label: string;
  badgeClass: string;
  supportsMultiplex: boolean;
  supportsTransport: boolean;
  supportsTargetKernel: boolean;
}

export const PROTOCOL_LIST: ProtocolMeta[] = [
  {
    type: 'vless',
    label: 'VLESS',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    supportsMultiplex: true,
    supportsTransport: true,
    supportsTargetKernel: true,
  },
  {
    type: 'vmess',
    label: 'VMess',
    badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    supportsMultiplex: true,
    supportsTransport: true,
    supportsTargetKernel: true,
  },
  {
    type: 'trojan',
    label: 'Trojan',
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    supportsMultiplex: true,
    supportsTransport: true,
    supportsTargetKernel: true,
  },
  {
    type: 'shadowsocks',
    label: 'Shadowsocks',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'hysteria',
    label: 'Hysteria',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'tuic',
    label: 'TUIC',
    badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'anytls',
    label: 'AnyTLS',
    badgeClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'mieru',
    label: 'Mieru',
    badgeClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
    supportsMultiplex: true,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'naive',
    label: 'Naive',
    badgeClass: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'socks',
    label: 'SOCKS',
    badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
  {
    type: 'http',
    label: 'HTTP',
    badgeClass: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
    supportsMultiplex: false,
    supportsTransport: false,
    supportsTargetKernel: true,
  },
];

export const PROTOCOL_MAP: Record<ServerProtocolType, ProtocolMeta> = Object.fromEntries(
  PROTOCOL_LIST.map((p) => [p.type, p]),
) as Record<ServerProtocolType, ProtocolMeta>;

export const KERNEL_NETWORKS: Record<TargetKernel, string[]> = {
  xray: ['tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'],
  singbox: ['tcp', 'ws', 'grpc', 'httpupgrade', 'http', 'quic'],
};

export const SHADOWSOCKS_CIPHERS = [
  'aes-128-gcm',
  'aes-192-gcm',
  'aes-256-gcm',
  'chacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',

];

export const SHADOWSOCKS_PLUGINS = [
  '',
  'obfs',
  'v2ray-plugin',
  'gost-plugin',
  'shadow-tls',
  'restls',
  'kcptun',
];

export const UTLS_FINGERPRINTS = [
  'chrome',
  'firefox',
  'safari',
  'ios',
  'android',
  'edge',
  '360',
  'qq',
  'random',
  'randomized',
];

export const ANYTLS_DEFAULT_PADDING = [
  'stop=8',
  '0=30-30',
  '1=100-400',
  '2=400-500,c,500-1000,c,500-1000,c,500-1000,c,500-1000',
  '3=9-9,500-1000',
  '4=500-1000',
  '5=500-1000',
  '6=500-1000',
  '7=500-1000',
];

export const TUIC_ALPN_OPTIONS = ['h3', 'h2', 'http/1.1'];

export function inferTargetKernel(
  type: ServerProtocolType,
  settings?: Record<string, unknown>,
): TargetKernel {
  const explicit = settings?.target_kernel;
  if (explicit === 'xray' || explicit === 'singbox') {
    return explicit;
  }
  const network = String(settings?.network ?? '');
  if (
    ['ws', 'grpc', 'httpupgrade', 'http', 'h2', 'quic'].includes(network) ||
    ['hysteria', 'tuic', 'anytls', 'naive', 'mieru'].includes(type)
  ) {
    return 'singbox';
  }
  return 'xray';
}

export function canonicalizeNetwork(network: string, kernel: TargetKernel): string {
  switch (network) {
    case 'raw':
      return 'tcp';
    case 'splithttp':
      return 'xhttp';
    case 'websocket':
      return 'ws';
    case 'h2':
      return kernel === 'singbox' ? 'http' : 'h2';
    default:
      return network || 'tcp';
  }
}

export function defaultProtocolSettings(type: ServerProtocolType): Record<string, unknown> {
  const kernel = inferTargetKernel(type, {});
  switch (type) {
    case 'vless':
      return {
        target_kernel: kernel,
        tls: 0,
        flow: '',
        network: 'tcp',
        network_settings: {},
        tls_settings: { server_name: '', allow_insecure: false },
        reality_settings: {
          server_name: '',
          server_port: '',
          dest: '',
          public_key: '',
          private_key: '',
          short_id: '',
        },
        encryption: { enabled: false, encryption: '', decryption: '' },
        utls: { enabled: false, fingerprint: 'chrome' },
        xray_fallback: '',
      };
    case 'vmess':
      return {
        target_kernel: kernel,
        tls: 0,
        network: 'tcp',
        network_settings: {},
        tls_settings: { server_name: '', allow_insecure: false },
        utls: { enabled: false, fingerprint: 'chrome' },
      };
    case 'trojan':
      return {
        target_kernel: kernel,
        tls: 1,
        network: 'tcp',
        network_settings: {},
        tls_settings: { server_name: '', allow_insecure: false },
        reality_settings: {
          server_name: '',
          server_port: '',
          dest: '',
          public_key: '',
          private_key: '',
          short_id: '',
        },
        utls: { enabled: false, fingerprint: 'chrome' },
        xray_fallback: '',
      };
    case 'shadowsocks':
      return {
        target_kernel: kernel,
        cipher: 'aes-128-gcm',
        obfs: '',
        obfs_settings: { host: '', path: '' },
        plugin: '',
        plugin_opts: '',
      };
    case 'hysteria':
      return {
        target_kernel: kernel,
        version: 2,
        bandwidth: { up: null, down: null },
        obfs: { open: false, type: 'salamander', password: '' },
        tls: { server_name: '', allow_insecure: false },
        hop_interval: null,
        hop_interval_max: null,
        hy2_settings: { kernel, bandwidth_mode: 'auto' },
      };
    case 'tuic':
      return {
        target_kernel: kernel,
        version: 5,
        congestion_control: 'bbr',
        alpn: ['h3'],
        udp_relay_mode: 'native',
        tls: { server_name: '', allow_insecure: false },
      };
    case 'anytls':
      return {
        target_kernel: kernel,
        padding_scheme: [...ANYTLS_DEFAULT_PADDING],
        tls: { server_name: '', allow_insecure: false },
      };
    case 'mieru':
      return {
        target_kernel: kernel,
        transport: 'TCP',
        traffic_pattern: '',
      };
    case 'socks':
    case 'naive':
    case 'http':
      return {
        target_kernel: kernel,
        tls: 0,
        tls_settings: { server_name: '', allow_insecure: false },
      };
  }
}

export function supportsXrayFallback(
  type: ServerProtocolType,
  settings: Record<string, unknown>,
): { supported: boolean; disabledByEncryption: boolean } {
  const tls = Number(settings.tls ?? (type === 'trojan' ? 1 : 0));
  const network = String(settings.network ?? 'tcp');
  const supported =
    (type === 'vless' || type === 'trojan') &&
    (tls === 1 || tls === 2) &&
    (network === '' || network === 'tcp' || network === 'raw');

  const encryption = settings.encryption as
    | { enabled?: boolean; decryption?: string | null }
    | undefined;
  const disabledByEncryption =
    type === 'vless' &&
    Boolean(encryption?.enabled) &&
    Boolean(encryption?.decryption) &&
    encryption?.decryption !== 'none';

  return { supported, disabledByEncryption };
}

export function parsePortRange(value: string | number | undefined | null): [number, number] | null {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(str);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (start < 1 || end > 65535 || start > end) return null;
  return [start, end];
}

export function isMultiPortRange(value: string | number | undefined | null): boolean {
  const range = parsePortRange(value);
  return range !== null && range[0] < range[1];
}

export function getTransportExample(
  kernel: TargetKernel,
  network: string,
  variant: 'official' | 'xhttp-split' = 'official',
): Record<string, unknown> {
  if (kernel === 'xray') {
    switch (network) {
      case 'ws':
        return { path: '/ws', host: 'cdn.example.com' };
      case 'grpc':
        return { serviceName: 'grpc-service' };
      case 'httpupgrade':
        return { path: '/upgrade', host: 'cdn.example.com' };
      case 'xhttp':
        if (variant === 'xhttp-split') {
          return {
            mode: 'packet-up',
            path: '/xhttp',
            host: 'up.example.com',
            extra: {
              scMaxEachPostBytes: 1000000,
              scMinPostsIntervalMs: 30,
              downloadSettings: {
                address: 'down.example.com',
                port: 443,
                network: 'xhttp',
                security: 'tls',
                tlsSettings: { serverName: 'down.example.com' },
                xhttpSettings: { path: '/xhttp', host: 'down.example.com' },
              },
            },
          };
        }
        return {
          mode: 'auto',
          path: '/xhttp',
          host: 'cdn.example.com',
          extra: {
            scMaxEachPostBytes: 1000000,
          },
        };
      default:
        return { acceptProxyProtocol: false };
    }
  }

  switch (network) {
    case 'ws':
      return {
        path: '/ws',
        headers: { Host: 'cdn.example.com' },
        max_early_data: 2048,
        early_data_header_name: 'Sec-WebSocket-Protocol',
      };
    case 'grpc':
      return {
        service_name: 'grpc-service',
        idle_timeout: '15s',
        ping_timeout: '15s',
        permit_without_stream: false,
      };
    case 'httpupgrade':
      return { path: '/upgrade', host: 'cdn.example.com' };
    case 'http':
      return { path: '/h2', host: ['cdn.example.com'], method: 'PUT' };
    case 'quic':
      return {};
    default:
      return { acceptProxyProtocol: false };
  }
}

export function getHy2MasqueradeExample(
  kernel: TargetKernel,
  kind: 'proxy' | 'file' | 'string',
): Record<string, unknown> {
  if (kernel === 'xray') {
    if (kind === 'proxy') {
      return { type: 'proxy', url: 'https://example.com', rewriteHost: true };
    }
    if (kind === 'file') {
      return { type: 'file', dir: '/var/www/html' };
    }
    return {
      type: 'string',
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      content: 'OK',
    };
  }

  if (kind === 'proxy') {
    return { type: 'proxy', url: 'https://example.com', rewrite_host: true };
  }
  if (kind === 'file') {
    return { type: 'file', directory: '/var/www/html' };
  }
  return {
    type: 'string',
    status_code: 200,
    headers: { 'Content-Type': 'text/plain' },
    content: 'OK',
  };
}

export function getCustomOutboundExample(kernel: TargetKernel): Array<Record<string, unknown>> {
  if (kernel === 'xray') {
    return [
      {
        tag: 'warp-out',
        protocol: 'socks',
        settings: {
          servers: [{ address: '127.0.0.1', port: 40000 }],
        },
      },
    ];
  }
  return [
    {
      tag: 'warp-out',
      type: 'socks',
      server: '127.0.0.1',
      server_port: 40000,
    },
  ];
}

export function getCustomRouteExample(
  kernel: TargetKernel,
  protocol: ServerProtocolType,
): Array<Record<string, unknown>> {
  const inboundTag = `${protocol}-in`;
  if (kernel === 'xray') {
    return [
      {
        type: 'field',
        inboundTag: [inboundTag],
        domain: ['geosite:openai'],
        outboundTag: 'warp-out',
      },
    ];
  }
  return [
    {
      inbound: [inboundTag],
      rule_set: ['geosite-openai'],
      outbound: 'warp-out',
    },
  ];
}

export function syncCdnServerFromClient(
  type: ServerProtocolType,
  clientSettings: Record<string, unknown>,
  existingServer?: {
    host?: string;
    port?: string | number;
    server_port?: string | number;
    protocol_settings?: Record<string, unknown>;
  },
  fallbackHost = '',
  fallbackPort: string | number = 443,
): {
  host: string;
  port: string | number;
  server_port: string | number;
  protocol_settings: Record<string, unknown>;
} {
  const cloned = JSON.parse(JSON.stringify(clientSettings || {})) as Record<string, unknown>;
  const existingPs = (existingServer?.protocol_settings || {}) as Record<string, unknown>;

  if (typeof existingPs.xray_fallback === 'string' && existingPs.xray_fallback) {
    cloned.xray_fallback = existingPs.xray_fallback;
  }

  const existingReality = existingPs.reality_settings as Record<string, unknown> | undefined;
  const clonedReality = cloned.reality_settings as Record<string, unknown> | undefined;
  if (clonedReality && existingReality?.private_key) {
    clonedReality.private_key = existingReality.private_key;
  }

  if (type === 'trojan' && Number(cloned.tls ?? 0) === 0) {
    cloned.tls = 1;
  }

  // Strip client-only XHTTP extra fields from server-side copy
  const ns = cloned.network_settings as Record<string, unknown> | undefined;
  if (ns && typeof ns === 'object' && ns.extra && typeof ns.extra === 'object') {
    const extra = { ...(ns.extra as Record<string, unknown>) };
    delete extra.noGRPCHeader;
    delete extra.scMinPostsIntervalMs;
    delete extra.xmux;
    delete extra.downloadSettings;
    if (Object.keys(extra).length > 0) {
      ns.extra = extra;
    } else {
      delete ns.extra;
    }
  }

  return {
    host: existingServer?.host || fallbackHost,
    port: existingServer?.port || fallbackPort,
    server_port: existingServer?.server_port || fallbackPort,
    protocol_settings: cloned,
  };
}

export function generateRandomShortId(byteLen = 4): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
