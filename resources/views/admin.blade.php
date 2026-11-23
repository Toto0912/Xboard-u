<!DOCTYPE html>
<html lang="zh-CN" translate="no" class="notranslate">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="google" content="notranslate" />
  <title>{{ $title }}</title>
  <script>
    window.settings = {
      base_url: "/",
      title: @json($title),
      version: @json($version),
      logo: @json($logo),
      secure_path: @json($secure_path)
    };
  </script>
  @php
    $manifestPath = public_path('assets/admin/manifest.json');
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
      <link rel="stylesheet" crossorigin href="/assets/admin/{{ $css }}" />
    @endforeach
    @foreach($preloads as $preload)
      <link rel="modulepreload" crossorigin href="/assets/admin/{{ $preload }}" />
    @endforeach
    @foreach($scripts as $js)
      <script type="module" crossorigin src="/assets/admin/{{ $js }}"></script>
    @endforeach
  @endif
</head>

<body>
  <div id="root"></div>
</body>

</html>
