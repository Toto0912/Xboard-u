// Loaded after the pinned upstream locale files, before its deferred app module.
// Keep fork wording separate so the official admin distribution stays untouched.
(() => {
  const messages = {
    'zh-CN': {
      title: '安装 xboard-node-u',
      description: '复制命令到目标服务器执行，以机器模式安装正式版 xboard-node-u 并接入当前面板，默认使用 sing-box。',
      hint: '支持 systemd Linux 和 Alpine/OpenRC；使用 root，或具备 sudo 权限的用户。',
    },
    'en-US': {
      title: 'Install xboard-node-u',
      description: 'Install the stable xboard-node-u release in machine mode, using sing-box by default.',
      hint: 'Supports systemd Linux and Alpine/OpenRC. Requires root or sudo.',
    },
    'ru-RU': {
      title: 'Установить xboard-node-u',
      description: 'Установка стабильной версии xboard-node-u в режиме machine; по умолчанию sing-box.',
      hint: 'Поддерживаются Linux с systemd и Alpine/OpenRC. Требуются root или sudo.',
    },
  };
  for (const [language, message] of Object.entries(messages)) {
    const install = window.XBOARD_TRANSLATIONS?.[language]?.machine?.install;
    if (install) Object.assign(install, message);
  }
})();
