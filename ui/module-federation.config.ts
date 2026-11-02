import { ModuleFederationConfig } from '@nx/rspack/module-federation';

const coreLibraries = new Set([
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
  'erxes-ui',
  '@apollo/client',
  'jotai',
  'ui-modules',
  'react-i18next',
]);

const config: ModuleFederationConfig = {
  name: 'frontline_ui',
  exposes: {
    './config': './src/config.tsx',
    './frontline': './src/modules/FrontlineMain.tsx',
    './knowledgebase': './src/modules/knowledgebase/Main.tsx',
    './automationsWidget':
      './src/widgets/automations/components/AutomationRemoteEntry.tsx',
    './notificationWidget':
      './src/widgets/notifications/NotificationRemoteEntries.tsx',
    './relationWidget': './src/widgets/RelationWidget.tsx',
    './contactWidget': './src/widgets/contact/ContactWidgets.tsx',
    './floatingWidget': './src/widgets/FloatingWidget.tsx',
    './selectErxesMessenger':
      './src/modules/integrations/erxes-messenger/components/SelectErxesMessenger.tsx',
  },

  shared: (libraryName, defaultConfig) => {
    if (coreLibraries.has(libraryName)) {
      return defaultConfig;
    }

    // Returning false means the library is not shared.
    return false;
  },

  // Nx reads shared versions from the root package.json, which in this
  // standalone repo lists none of the core libraries, so it would share none
  // and the remote would run its own React ("reading 'useCallback'"). Share
  // them explicitly as singletons consumed from the host (no fallback copy).
  additionalShared: [...coreLibraries].map((libraryName) => ({
    libraryName,
    sharedConfig: {
      singleton: true,
      strictVersion: false,
      requiredVersion: false,
      import: false,
    },
  })),
};

/**
 * Nx requires a default export of the config to allow correct resolution of the module federation graph.
 **/
export default config;
