<script setup>
import { computed, ref, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useAccount } from 'dashboard/composables/useAccount';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import NextButton from 'dashboard/components-next/button/Button.vue';
import WithLabel from 'v3/components/Form/WithLabel.vue';
import NextInput from 'next/input/Input.vue';
import SectionLayout from '../account/components/SectionLayout.vue';

const store = useStore();
const alert = useAlert();
const { accountId } = useAccount();

const leadWebhookUrl = ref('');

const currentAccount = computed(() => {
  return store.getters['accounts/getAccount'](accountId.value) || {};
});

const savedWebhookUrl = computed(() => {
  const settings = currentAccount.value.settings || {};
  return settings.lead_webhook_url || '';
});

const isUpdating = computed(() => {
  return store.getters['accounts/getUIFlags'].isUpdating;
});

onMounted(() => {
  leadWebhookUrl.value = savedWebhookUrl.value;
});

const updateAccount = async () => {
  try {
    // Send at top level (not nested) — matches Rails permitted_settings_attributes
    await store.dispatch('accounts/update', {
      lead_webhook_url: leadWebhookUrl.value,
    });
    alert.openAlert({
      message: 'Webhooks settings updated successfully!',
    });
  } catch (error) {
    alert.openAlert({
      message: 'Failed to update webhooks settings. Please try again.',
    });
  }
};
</script>

<template>
  <div class="flex flex-col max-w-2xl mx-auto w-full">
    <BaseSettingsHeader title="Webhooks" />

    <div class="flex-grow flex-shrink min-w-0 mt-3">
      <SectionLayout
        title="Lead Generation Webhook"
        description="This webhook is triggered when a user completes the lead qualification flow in the KLBOT web widget. We will send a POST request with the user's answers formatted as a JSON payload."
      >
        <div class="grid gap-4 max-w-lg">
          <!-- Saved webhook display -->
          <div
            v-if="savedWebhookUrl"
            class="flex items-center gap-3 px-3 py-2 rounded-lg bg-n-alpha-1 border border-n-weak"
          >
            <span class="i-lucide-check-circle size-4 text-green-500 flex-shrink-0" />
            <div class="flex flex-col min-w-0">
              <span class="text-xs text-n-slate-10 font-medium mb-0.5">Active webhook</span>
              <span class="text-sm text-n-slate-12 truncate">{{ savedWebhookUrl }}</span>
            </div>
          </div>

          <WithLabel label="HubSpot Webhook URL">
            <NextInput
              v-model="leadWebhookUrl"
              class="w-full"
              placeholder="https://api.hsforms.com/submissions/v3/integration/submit/..."
            />
          </WithLabel>

          <div>
            <NextButton
              blue
              :is-loading="isUpdating"
              :disabled="isUpdating"
              @click="updateAccount"
            >
              Update Settings
            </NextButton>
          </div>
        </div>
      </SectionLayout>
    </div>
  </div>
</template>
