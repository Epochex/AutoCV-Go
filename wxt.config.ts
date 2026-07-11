import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AutoCV Go · 网申填充助手',
    description: '本地保存简历，扫描中文网申表单，并在人工可控的前提下自动填充。',
    permissions: ['storage', 'activeTab', 'scripting', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '打开 AutoCV Go',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
