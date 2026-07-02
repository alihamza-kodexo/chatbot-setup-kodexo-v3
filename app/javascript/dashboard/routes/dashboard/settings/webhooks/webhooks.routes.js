import SettingsWrapper from '../SettingsWrapper.vue';
import Index from './Index.vue';
import { frontendURL } from '../../../../helper/URLHelper';

export default {
  routes: [
    {
      path: frontendURL('accounts/:accountId/settings/webhooks'),
      component: SettingsWrapper,
      children: [
        {
          path: '',
          name: 'webhooks_settings_index',
          component: Index,
          meta: {
            permissions: ['administrator'],
          },
        },
      ],
    },
  ],
};
