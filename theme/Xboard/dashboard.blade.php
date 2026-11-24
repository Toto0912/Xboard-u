<!doctype html>
<html lang="zh-CN">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ $title }}</title>
  <script>
    window.routerBase = "/";
    window.settings = {
      title: @json($title),
      assets_path: @json('/theme/' . $theme . '/assets'),
      theme: {
        color: @json($theme_config['theme_color'] ?? 'default'),
      },
      version: @json($version),
      background_url: @json($theme_config['background_url'] ?? ''),
      description: @json($description),
      i18n: [
        'zh-CN',
        'zh-TW',
        'en-US',
        'fa-IR',
        'ja-JP',
        'vi-VN',
        'ko-KR',
        'ru-RU'
      ],
      logo: @json($logo)
    };
  </script>
  @php
    $publicManifest = public_path('theme/' . $theme . '/assets/manifest.json');
    $baseManifest = base_path('theme/' . $theme . '/assets/manifest.json');
    $manifestPath = file_exists($publicManifest) ? $publicManifest : $baseManifest;
    $manifest = file_exists($manifestPath) ? json_decode(file_get_contents($manifestPath), true) : null;
    $entry = is_array($manifest) ? ($manifest['index.html'] ?? null) : null;
    $scripts = [];
    $preloads = [];
    $styles = [];

    if (is_array($entry)) {
      $visited = [];
      $collectAssets = function ($chunkName) use (&$collectAssets, &$manifest, &$visited, &$scripts, &$preloads, &$styles) {
        if (isset($visited[$chunkName]) || !isset($manifest[$chunkName]) || !is_array($manifest[$chunkName])) {
          return;
        }

        $visited[$chunkName] = true;
        $chunk = $manifest[$chunkName];

        if (!empty($chunk['css']) && is_array($chunk['css'])) {
          foreach ($chunk['css'] as $cssFile) {
            $styles[$cssFile] = $cssFile;
          }
        }

        if (!empty($chunk['imports']) && is_array($chunk['imports'])) {
          foreach ($chunk['imports'] as $import) {
            $collectAssets($import);
          }
        }

        if (!empty($chunk['file'])) {
          if (!empty($chunk['isEntry'])) {
            $scripts[$chunk['file']] = $chunk['file'];
          } else {
            $preloads[$chunk['file']] = $chunk['file'];
          }
        }
      };

      $collectAssets('index.html');
    }
  @endphp

  @if($entry && count($scripts) > 0)
    @foreach($styles as $css)
      <link rel="stylesheet" crossorigin href="/theme/{{ $theme }}/assets/{{ $css }}" />
    @endforeach
    @foreach($preloads as $preload)
      <link rel="modulepreload" crossorigin href="/theme/{{ $theme }}/assets/{{ $preload }}" />
    @endforeach
    @foreach($scripts as $js)
      <script type="module" crossorigin src="/theme/{{ $theme }}/assets/{{ $js }}"></script>
    @endforeach
  @endif
</head>

<body>
  <div id="root"></div>
  {!! $theme_config['custom_html'] ?? '' !!}
</body>

</html>
