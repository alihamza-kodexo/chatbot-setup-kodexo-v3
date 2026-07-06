<script>
import { useBranding } from 'shared/composables/useBranding';

// Mapping Environment Variables
const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || '';
const LOGO_THUMBNAIL = import.meta.env.VITE_BRAND_LOGO_THUMBNAIL || '/favicon-32x32.png';
const WIDGET_BRAND_URL = import.meta.env.VITE_BRAND_URL || '';
const POWERED_BY_TEXT = import.meta.env.VITE_BRAND_POWERED_BY || 'Powered by';

export default {
  props: {
    disableBranding: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const { replaceInstallationName } = useBranding();
    return {
      replaceInstallationName,
      // Expose variables to the template
      BRAND_NAME,
      LOGO_THUMBNAIL,
      POWERED_BY_TEXT,
    };
  },
  computed: {
    brandRedirectURL() {
      // Use the URL defined in the env file
      const baseUrl = WIDGET_BRAND_URL;
      if (!baseUrl) return '';

      try {
        const referrerHost = this.$store.getters['appConfig/getReferrerHost'];
        const url = new URL(baseUrl);

        if (referrerHost) {
          url.searchParams.set('utm_source', referrerHost);
          url.searchParams.set('utm_medium', 'widget');
        } else {
          url.searchParams.set('utm_medium', 'survey');
        }
        url.searchParams.set('utm_campaign', 'branding');

        return url.toString();
      } catch (e) {
        // Fallback to base URL if URL parsing fails or store is missing
        return baseUrl;
      }
    },
  },
};
</script>

<template>
  <!-- Use BRAND_NAME from env -->
  <div
    v-if="BRAND_NAME && !disableBranding"
    class="px-0 py-3 flex justify-center"
  >
    <a
      :href="brandRedirectURL"
      rel="noreferrer noopener nofollow"
      target="_blank"
      class="branding--link text-n-slate-11 hover:text-n-slate-12 cursor-pointer text-xs inline-flex grayscale-[1] hover:grayscale-0 hover:opacity-100 opacity-90 no-underline justify-center items-center leading-3"
    >
      <img
        class="ltr:mr-1 rtl:ml-1 max-w-3 max-h-3"
        :alt="BRAND_NAME"
        :src="LOGO_THUMBNAIL"
      />
      <span>
        <!-- Use POWERED_BY_TEXT from env -->
        {{ replaceInstallationName(POWERED_BY_TEXT) }}
      </span>
    </a>
  </div>
  <div v-else class="p-3" />
</template>
