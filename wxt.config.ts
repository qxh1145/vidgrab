import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'vi',
    permissions: [
      'webRequest',
      'declarativeNetRequestWithHostAccess',
      'storage',
      'unlimitedStorage',
      'downloads',
      'tabs',
      'scripting',
      'sidePanel',
      'notifications',
      'webNavigation',
    ],
    host_permissions: ['<all_urls>'],
  },
});
