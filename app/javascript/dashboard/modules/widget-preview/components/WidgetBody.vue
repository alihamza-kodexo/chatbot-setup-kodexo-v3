<script setup>
import { ref, watch, nextTick, defineProps } from 'vue';

defineProps({
  config: {
    type: Object,
    default: () => ({}),
  },
});

const INITIAL_MESSAGES = [
  {
    id: 1,
    sender: 'agent',
    type: 'options',
    title: 'What project do you want?',
    options: [
      { id: 'python', title: 'Python' },
      { id: 'java', title: 'Java' },
    ],
    selected: '',
    hideFields: false,
  },
];

const messages = ref([...INITIAL_MESSAGES]);
const container = ref(null);

const scrollToBottom = () => {
  nextTick(() => {
    if (container.value) {
      container.value.scrollTop = container.value.scrollHeight;
    }
  });
};

watch(messages, scrollToBottom, { deep: true });

const resetFlow = () => {
  messages.value = [
    {
      id: Date.now(),
      sender: 'agent',
      type: 'options',
      title: 'What project do you want?',
      options: [
        { id: 'python', title: 'Python' },
        { id: 'java', title: 'Java' },
      ],
      selected: '',
      hideFields: false,
    },
  ];
};

const onOptionSelect = (option, messageIndex) => {
  // Mark current options as selected and hide choices
  messages.value[messageIndex].selected = option.id;
  messages.value[messageIndex].hideFields = true;

  // Append user response
  messages.value.push({
    id: Date.now(),
    sender: 'user',
    type: 'text',
    text: option.title,
  });

  // Determine next step after a short delay for natural feeling
  setTimeout(() => {
    if (option.id === 'python') {
      messages.value.push({
        id: Date.now() + 1,
        sender: 'agent',
        type: 'options',
        title: 'Select the Python framework:',
        options: [
          { id: 'opencv', title: 'OpenCV' },
          { id: 'keras', title: 'Keras' },
        ],
        selected: '',
        hideFields: false,
      });
    } else if (option.id === 'java') {
      messages.value.push({
        id: Date.now() + 1,
        sender: 'agent',
        type: 'options',
        title: 'Select the Java integration/tool:',
        options: [
          { id: '8n', title: '8n' },
          { id: 'make', title: 'Make' },
        ],
        selected: '',
        hideFields: false,
      });
    } else {
      // It's a second level selection (opencv, keras, 8n, make)
      messages.value.push({
        id: Date.now() + 1,
        sender: 'agent',
        type: 'text',
        text: `Thanks! You selected ${option.title}.`,
      });
    }
  }, 600);
};

const flowTestModeText = 'Flow Test Mode';
const resetFlowText = 'Reset Flow';
</script>

<template>
  <div class="flex flex-col h-[calc(2rem*10)]">
    <!-- Header with Reset Button -->
    <div
      class="flex justify-between items-center px-4 py-2 border-b border-n-slate-3 dark:border-n-solid-2 bg-n-slate-1 dark:bg-n-solid-2"
    >
      <span class="text-xs text-n-slate-11 font-medium">
        {{ flowTestModeText }}
      </span>
      <button
        class="text-xs font-semibold hover:underline bg-transparent border-0 cursor-pointer p-0"
        :style="{ color: config.color || '#002f49' }"
        @click="resetFlow"
      >
        {{ resetFlowText }}
      </button>
    </div>

    <!-- Messages Container -->
    <div ref="container" class="flex-1 px-4 py-2 overflow-y-auto space-y-3">
      <div v-for="(msg, index) in messages" :key="msg.id">
        <!-- User Message -->
        <div
          v-if="msg.sender === 'user'"
          class="items-end flex justify-end ml-auto mb-1 mt-0 max-w-[85%] text-right"
        >
          <div
            class="rounded-[1.25rem] rounded-br-[0.25rem] text-white dark:text-white text-sm px-4 py-2.5"
            :style="{ background: config.color || '#002f49' }"
          >
            <p class="m-0 text-left">
              {{ msg.text }}
            </p>
          </div>
        </div>

        <!-- Agent Message -->
        <div v-else class="flex flex-col items-start max-w-[85%]">
          <!-- Text Bubble -->
          <div
            v-if="msg.type === 'text'"
            class="shadow rounded-[1.25rem] rounded-bl-[0.25rem] px-4 py-2.5 inline-block text-sm text-n-slate-12 bg-n-background dark:bg-n-solid-3"
          >
            <p class="m-0">
              {{ msg.text }}
            </p>
          </div>

          <!-- Options Bubble -->
          <div v-else-if="msg.type === 'options'" class="w-full">
            <div
              class="shadow rounded-[1.25rem] rounded-bl-[0.25rem] px-4 py-2.5 inline-block text-sm text-n-slate-12 bg-n-background dark:bg-n-solid-3 w-full"
            >
              <h4
                class="text-n-slate-12 text-sm font-normal my-1 leading-[1.5]"
              >
                {{ msg.title }}
              </h4>
              <ul
                v-if="!msg.hideFields"
                class="flex flex-wrap gap-2 mt-2 w-full p-0 m-0"
              >
                <li
                  v-for="option in msg.options"
                  :key="option.id"
                  class="list-none rounded-[5rem] border border-solid m-0 max-w-full hover:bg-n-slate-2 dark:hover:bg-n-solid-2 transition-colors"
                  :style="{ borderColor: config.color || '#002f49' }"
                >
                  <button
                    class="bg-transparent border-0 cursor-pointer px-4 py-1.5 text-xs leading-normal rounded-[2rem] font-medium"
                    :style="{ color: config.color || '#002f49' }"
                    @click="onOptionSelect(option, index)"
                  >
                    <span>{{ option.title }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure custom scrollbars for the widget preview scroll container */
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}
</style>
