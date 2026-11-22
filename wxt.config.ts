import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser: targetBrowser }) => {
    const isFirefox = targetBrowser === 'firefox';
    return {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'vi',
      permissions: [
        'webRequest',
        ...(isFirefox ? ['declarativeNetRequest'] : ['declarativeNetRequestWithHostAccess', 'sidePanel']),
        'storage',
        'unlimitedStorage',
        'downloads',
        'tabs',
        'scripting',
        'notifications',
        'webNavigation',
      ],
      host_permissions: ['<all_urls>'],
      ...(isFirefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'vidgrab@extension.local',
                strict_min_version: '109.0',
              },
            },
            sidebar_action: {
              default_panel: 'sidepanel.html',
              default_title: 'VidGrab',
            },
          }
        : {}),
    };
  },
});
