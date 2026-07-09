<script>
import ChatMessage from 'widget/components/ChatMessage.vue';
import AgentTypingBubble from 'widget/components/AgentTypingBubble.vue';
import DateSeparator from 'shared/components/DateSeparator.vue';
import Spinner from 'shared/components/Spinner.vue';
import { useDarkMode } from 'widget/composables/useDarkMode';
import { MESSAGE_TYPE } from 'shared/constants/messages';
import { mapActions, mapGetters } from 'vuex';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { emitter } from 'shared/helpers/mitt';
import { setPriorityAPI } from 'widget/api/conversation';
import { createTemporaryMessage } from 'widget/store/modules/conversation/helpers';

export default {
  name: 'ConversationWrap',
  components: {
    ChatMessage,
    AgentTypingBubble,
    DateSeparator,
    Spinner,
  },
  props: {
    groupedMessages: {
      type: Array,
      default: () => [],
    },
  },
  setup() {
    const { darkMode } = useDarkMode();
    return { darkMode };
  },
  data() {
    return {
      previousScrollHeight: 0,
      previousConversationSize: 0,
      waitingForFreeInput: false,
      currentInputStep: null,
      isBotTyping: false,
      hasHandledInitialLoad: false,
      flowState: {},
      flowMessages: [],
      isCustomBotFlowActive: true,
      isWaitingForValidation: false,
      isCustomerSupportMode: false,
    };
  },
  computed: {
    ...mapGetters({
      earliestMessage: 'conversation/getEarliestMessage',
      lastMessage: 'conversation/getLastMessage',
      allMessagesLoaded: 'conversation/getAllMessagesLoaded',
      isFetchingList: 'conversation/getIsFetchingList',
      conversationSize: 'conversation/getConversationSize',
      isAgentTyping: 'conversation/getIsAgentTyping',
      conversationAttributes: 'conversationAttributes/getConversationParams',
    }),
    colorSchemeClass() {
      return `${this.darkMode === 'dark' ? 'dark-scheme' : 'light-scheme'}`;
    },
    showStatusIndicator() {
      const { status } = this.conversationAttributes;
      const isConversationInPendingStatus = status === 'pending';
      const isLastMessageIncoming =
        this.lastMessage && this.lastMessage.message_type === MESSAGE_TYPE.INCOMING;
      return (
        this.isAgentTyping ||
        this.isBotTyping ||
        (isConversationInPendingStatus && isLastMessageIncoming)
      );
    },
  },
  watch: {
    isFetchingList(fetching) {
      if (!fetching && !this.hasHandledInitialLoad) {
        this.hasHandledInitialLoad = true;
        const isFlowCompleted = localStorage.getItem('kodexo_flow_completed') === 'true';

        if (this.conversationSize === 0) {
          localStorage.removeItem('kodexo_flow_progress');
          this.askInitialIntent();
        } else if (!isFlowCompleted) {
          if (!this.restoreFlowProgress()) this.askInitialIntent();
        } else {
          this.showStartOverButton();
        }
        this.$nextTick(() => { this.scrollToBottom(); });
      }
    },
    allMessagesLoaded() {
      this.previousScrollHeight = 0;
    },
    flowMessages: {
      deep: true,
      handler() {
        this.$nextTick(() => {
          this.saveFlowProgress();
          setTimeout(() => {
            this.scrollToBottom();
          }, 150);
        });
      },
    },
    lastMessage: {
      deep: true,
      handler(newMsg) {
        if (!newMsg) return;
        
        // 1 = incoming from agent/bot
        if (this.isWaitingForValidation && newMsg.message_type === 1) {
          if (newMsg.content && newMsg.content.includes('[SYSTEM_VALID]')) {
            this.isWaitingForValidation = false;
            this.proceedToNextStep();
          } else if (newMsg.content && newMsg.content.includes('[SYSTEM_INVALID]')) {
            this.isWaitingForValidation = false;
            this.isBotTyping = false;
            const errorMsg = newMsg.content.replace('[SYSTEM_INVALID]', '').trim();
            this.flowMessages.push({
              id: Date.now(),
              sender: 'agent',
              type: 'text',
              text: errorMsg || 'Please provide a valid answer.',
            });
            // Re-enable chat input for retry
            this.waitingForFreeInput = true;
            emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
            this.scrollToBottom();
          } else {
            // Fallback: If AI didn't use the tag, just show the message as conversation anyway!
            this.isWaitingForValidation = false;
            this.isBotTyping = false;
            this.flowMessages.push({
              id: Date.now(),
              sender: 'agent',
              type: 'text',
              text: newMsg.content.trim(),
            });
            this.waitingForFreeInput = true;
            emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
            this.scrollToBottom();
          }
        }
        
        if (this.isCustomerSupportMode && newMsg.message_type === 1) {
          if (newMsg.content && newMsg.content.includes('[LEAD_CONFIRMED]')) {
            const jsonStrMatch = newMsg.content.match(/\{[\s\S]*\}/);
            if (jsonStrMatch) {
              try {
                const jsonPayload = JSON.parse(jsonStrMatch[0]);
                // Merge JSON into flowState
                Object.assign(this.flowState, jsonPayload);
                this.submitToHubspot();
                
                // End customer support mode
                this.isCustomerSupportMode = false;
                
                // Show Goodbye and close flow
                this.askGoodbye();
              } catch (e) {
                console.error("Failed to parse LEAD_CONFIRMED json", e);
              }
            }
          }
        }
      }
    }
  },
  mounted() {
    window.isCustomBotFlowActive = true;
    this.isCustomBotFlowActive = true;
    const watermark = document.createComment(' Developer: Ali Hamza Sultan ');
    this.$el.prepend(watermark);

    this.$el.addEventListener('scroll', this.handleScroll);
    
    if (!this.isFetchingList) {
      this.hasHandledInitialLoad = true;
      const isFlowCompleted = localStorage.getItem('kodexo_flow_completed') === 'true';

      if (this.conversationSize === 0) {
        localStorage.removeItem('kodexo_flow_progress');
        // Send a hidden trigger message to create the conversation in the backend immediately
        const initMessage = createTemporaryMessage({ content: '[SYSTEM_INIT] User started flow' });
        this.sendMessageWithData(initMessage).catch(() => {});
        this.askInitialIntent();
      } else if (!isFlowCompleted) {
        if (!this.restoreFlowProgress()) this.askInitialIntent();
      } else {
        this.showStartOverButton();
      }
    }
    
    this.scrollToBottom();
    setTimeout(() => {
      if (!this.waitingForFreeInput) {
        emitter.emit(BUS_EVENTS.DISABLE_CHAT_INPUT);
      }
    }, 50);
    emitter.on(BUS_EVENTS.MESSAGE_SENT, this.onFreeInputReceived);
  },
  updated() {
    if (this.previousConversationSize !== this.conversationSize) {
      this.previousConversationSize = this.conversationSize;
      this.scrollToBottom();
    }
  },
  unmounted() {
    window.isCustomBotFlowActive = false;
    this.$el.removeEventListener('scroll', this.handleScroll);
    emitter.off(BUS_EVENTS.MESSAGE_SENT, this.onFreeInputReceived);
    emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
  },
  methods: {
    ...mapActions('conversation', ['fetchOldConversations', 'sendMessage', 'sendMessageWithData']),
    saveFlowProgress() {
      localStorage.setItem('kodexo_flow_progress', JSON.stringify({
        flowState: this.flowState,
        flowMessages: this.flowMessages,
        currentInputStep: this.currentInputStep,
        waitingForFreeInput: this.waitingForFreeInput,
        isWaitingForValidation: this.isWaitingForValidation,
      }));
    },
    restoreFlowProgress() {
      const saved = localStorage.getItem('kodexo_flow_progress');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data && data.flowMessages && data.flowMessages.length > 0) {
            this.flowState = data.flowState || {};
            this.flowMessages = data.flowMessages || [];
            this.currentInputStep = data.currentInputStep || null;
            this.waitingForFreeInput = data.waitingForFreeInput || false;
            this.isWaitingForValidation = data.isWaitingForValidation || false;
            
            setTimeout(() => {
              if (this.waitingForFreeInput) {
                emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
              } else {
                emitter.emit(BUS_EVENTS.DISABLE_CHAT_INPUT);
              }
            }, 50);
            return true;
          }
        } catch (e) {
          // ignore
        }
      }
      return false;
    },
    scrollToBottom() {
      const container = this.$el;
      container.scrollTop = container.scrollHeight - this.previousScrollHeight;
      this.previousScrollHeight = 0;
    },
    handleScroll() {
      if (
        this.isFetchingList ||
        this.allMessagesLoaded ||
        !this.conversationSize
      ) {
        return;
      }

      if (this.$el.scrollTop < 100) {
        this.fetchOldConversations({ before: this.earliestMessage.id });
        this.previousScrollHeight = this.$el.scrollHeight;
      }
    },
    // Called when user types freely
    async onFreeInputReceived({ content }) {
      if (!this.waitingForFreeInput) return;
      this.waitingForFreeInput = false;
      emitter.emit(BUS_EVENTS.DISABLE_CHAT_INPUT);
      
      this.flowState[this.currentInputStep] = content;

      // Add the user's typed message visually to the custom flow
      this.flowMessages.push({
        id: Date.now(),
        sender: 'user',
        type: 'text',
        text: content,
      });

      // Client-side validation for Email
      if (this.currentInputStep === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(content.trim())) {
          this.flowMessages.push({
            id: Date.now() + 1, sender: 'agent', type: 'text',
            text: 'Please enter a valid email address.',
          });
          this.waitingForFreeInput = true;
          emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
          this.scrollToBottom();
          return;
        }
      }

      // Client-side validation for Phone
      if (this.currentInputStep === 'phone') {
        const phoneRegex = /^\+?[0-9\s\-()]{7,15}$/;
        if (!phoneRegex.test(content.trim())) {
          this.flowMessages.push({
            id: Date.now() + 1, sender: 'agent', type: 'text',
            text: 'Please enter a valid phone number (e.g., +1 234 567 8900).',
          });
          this.waitingForFreeInput = true;
          emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
          this.scrollToBottom();
          return;
        }
      }

      this.isBotTyping = true;
      this.scrollToBottom();

      // Send to Chatwoot backend for logging
      const tempMessage = createTemporaryMessage({ content: `[${this.currentInputStep}] ${content}` });
      
      try {
        if (this.currentInputStep === 'project_brief') {
          // Only wait for n8n AI validation on complex free-text fields
          this.isWaitingForValidation = true;
          await this.sendMessageWithData(tempMessage);
        } else {
          // Instantly proceed for fields validated client-side (email/phone)
          this.sendMessageWithData(tempMessage).catch(() => {});
          this.proceedToNextStep();
        }
      } catch (e) {
        // Fallback if API fails
        this.isWaitingForValidation = false;
        this.proceedToNextStep();
      }
    },
    
    // Extracted logic to proceed to the next step
    proceedToNextStep() {
      this.isBotTyping = false;
      if (this.currentInputStep === 'project_brief') {
        this.askTimeline();
      } else if (this.currentInputStep === 'email') {
        const content = this.flowState['email'];
        const emailName = content.split('@')[0];
        this.$store.dispatch('contacts/update', { user: { email: content, name: emailName } }).catch(() => {});
        this.askPhone();
      } else if (this.currentInputStep === 'phone') {
        const content = this.flowState['phone'];
        this.$store.dispatch('contacts/update', { user: { phone_number: content } }).catch(() => {});
        this.askReferralSource();
      }
      this.scrollToBottom();
    },
    
    // --- HELPER METHODS FOR FLOW STEPS --- //
    getPriorityFromTimeline(timelineTitle) {
      const map = {
        'ASAP - We need this urgent': 'urgent',
        '1-3 months': 'high',
        '3-6 months': 'medium',
        '6+ months': 'low',
        'Flexible / Not sure yet': 'low',
        'Any of the above': 'medium',
      };
      return map[timelineTitle] || 'medium';
    },
    showStartOverButton() {
      window.isCustomBotFlowActive = false;
      this.isCustomBotFlowActive = false;
      this.flowMessages = [{
        id: Date.now(),
        sender: 'agent',
        type: 'options',
        title: "Submit a new inquiry?",
        options: [
          { id: 'start_over', action: 'start_over', title: 'Start Over' }
        ],
        hideFields: false,
      }];
    },
    askInitialIntent() {
      this.flowMessages.push({
        id: Date.now(),
        sender: 'agent',
        type: 'options',
        title: 'Hello and welcome to Kodexo Labs! 👋\nHow can I help you today?',
        options: [
          { id: 'quote', title: 'I need a quote' },
          { id: 'project', title: 'Discuss my Project' },
          { id: 'portfolio', title: 'Learn about your Portfolio' },
          { id: 'services', title: 'Learn about your Service' },
          { id: 'contact', title: 'Contact and Location Info' },
          { id: 'exploring', title: 'Just exploring' },
          { id: 'customer_support', title: 'Customer Support' },
          { id: 'any_of_the_above', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    askServiceSelector() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: 'Pick the closest match:',
        options: [
          { id: 'service', action: 'service_selected', title: 'AI/ML Development' },
          { id: 'service', action: 'service_selected', title: 'Generative AI Solution' },
          { id: 'service', action: 'service_selected', title: 'ChatGPT Integration' },
          { id: 'service', action: 'service_selected', title: 'Business Process Automation' },
          { id: 'service', action: 'service_selected', title: 'Conversational Voice Agent' },
          { id: 'service', action: 'service_selected', title: 'Web Application' },
          { id: 'service', action: 'service_selected', title: 'Mobile Applications (iOS)' },
          { id: 'service', action: 'service_selected', title: 'Other' },
          { id: 'service', action: 'service_selected', title: 'Any of the above' },
        ],
        hideFields: false,
      });
    },
    askConsultationIntro() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: "Awesome choice! 🗓️\nBook your free 30-minute consultation with our team. We'll discuss your project, answer questions, and see how we can help.",
        options: [
          { id: 'book_call_now', title: 'Book a Call Now' },
          { id: 'continue_services', title: 'Continue to Select Services' },
          { id: 'any_of_the_above_consult', action: 'service_selected', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    askContactInfo() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: `Here's how to reach us!
📞 Phone: +1 219 766 5259
✉️ Email: contact@kodexolabs.com

🇺🇸 USA:
Austin: 316 W 12th St, 4th Floor, Austin, TX 78701
New York: 211 E 43rd St, 7th Floor, New York, NY 10017
San Francisco: 535 Mission St 14th floor, San Francisco, CA 94105, United States
Chicago, IL: 110 N Wacker Dr, 25th Floor, Suite 2500, Chicago, IL 60606

🇬🇧 UK:
London: 27 Old Gloucester Street, London, WC1N 3AX

🇵🇰 Pakistan:
Karachi: B-145, Block 5 Gulshan-e-Iqbal, Karachi

We work with clients in all over the world! 🌍`,
        options: [
          { id: 'discuss_project', title: 'Discuss My Project' },
          { id: 'any_of_the_above_contact', action: 'service_selected', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    askProjectBrief() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'text',
        text: 'Tell me briefly about your project by typing below.',
      });
      this.currentInputStep = 'project_brief';
      this.waitingForFreeInput = true;
      emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
    },
    askTimeline() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: "What's your ideal timeline?",
        options: [
          { id: 't1', action: 'timeline_selected', title: 'ASAP - We need this urgent' },
          { id: 't2', action: 'timeline_selected', title: '1-3 months' },
          { id: 't3', action: 'timeline_selected', title: '3-6 months' },
          { id: 't4', action: 'timeline_selected', title: '6+ months' },
          { id: 't5', action: 'timeline_selected', title: 'Flexible / Not sure yet' },
          { id: 't6', action: 'timeline_selected', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    askBudget() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: "And your approximate budget range?\n(This helps us recommend the right approach)",
        options: [
          { id: 'b1', action: 'budget_selected', title: 'Under $10K' },
          { id: 'b2', action: 'budget_selected', title: '$10K - $50K' },
          { id: 'b3', action: 'budget_selected', title: '$50K - $100K' },
          { id: 'b4', action: 'budget_selected', title: '$100K+' },
          { id: 'b5', action: 'budget_selected', title: 'Need guidance on budget' },
          { id: 'b6', action: 'budget_selected', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    askEmail() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'text',
        text: "Perfect! What's your email address?",
      });
      this.currentInputStep = 'email';
      this.waitingForFreeInput = true;
      emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
    },
    askPhone() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'text',
        text: 'Phone number in case we need to reach you quickly:',
      });
      this.currentInputStep = 'phone';
      this.waitingForFreeInput = true;
      emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
    },
    askReferralSource() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: "One last thing — how did you hear about us?",
        options: [
          { id: 'r1', action: 'referral_selected', title: 'Google Search' },
          { id: 'r2', action: 'referral_selected', title: 'LinkedIn' },
          { id: 'r3', action: 'referral_selected', title: 'Referred by Someone' },
          { id: 'r4', action: 'referral_selected', title: 'Social Media' },
          { id: 'r5', action: 'referral_selected', title: 'Clutch' },
          { id: 'r6', action: 'referral_selected', title: 'Other' },
          { id: 'r7', action: 'referral_selected', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    askFinalConfirmation() {
      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: `Thanks! 🎉\nOur team will review your project and get back to you within 24 hours.\nWant to skip the wait? Book a call directly with our team:`,
        options: [
          { id: 'schedule_call', action: 'book_meeting', title: 'Schedule a Call Now' },
          { id: 'wait_email', action: 'final_action', title: "I'll wait for your email" },
          { id: 'any_final', action: 'final_action', title: 'Any of the above' }
        ],
        hideFields: false,
      });
    },
    async submitToHubspot() {
      const payload = {
        fields: [
          { name: "fullname", value: this.flowState['name'] || "" },
          { name: "email_address", value: this.flowState['email'] || "" },
          { name: "phone_No", value: this.flowState['phone'] || "" },
          { name: "user_intent_kl", value: this.flowState['user_intent'] || "" },
          { name: "lead_source_kl", value: this.flowState['lead_source'] || "" },
          { name: "project_type_kl", value: this.flowState['project_type'] || "" },
          { name: "project_description_KL", value: this.flowState['project_brief'] || "" },
          { name: "timeline_KL", value: this.flowState['timeline'] || "" },
          { name: "budget_range_KL", value: this.flowState['budget_range'] || "" }
        ],
        context: {
          pageUri: "https://kodexolabs.com",
          pageName: "AI Software Development Company | Kodexo Labs"
        }
      };

      try {
        const webhookUrl = window.chatwootWebChannel.lead_webhook_url;
        if (!webhookUrl) {
          console.warn('No lead_webhook_url configured in Chatwoot settings.');
          return;
        }
        await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        console.error('Error submitting to Hubspot:', error);
      }
    },
    async askGoodbye() {
      localStorage.setItem('kodexo_flow_completed', 'true');
      const summary = `Lead Collected:
- Intent: ${this.flowState['user_intent'] || 'N/A'}
- Service: ${this.flowState['project_type'] || 'N/A'}
- Brief: ${this.flowState['project_brief'] || 'N/A'}
- Timeline: ${this.flowState['timeline'] || 'N/A'}
- Budget: ${this.flowState['budget_range'] || 'N/A'}
- Email: ${this.flowState['email'] || 'N/A'}`;
      
      window.isCustomBotFlowActive = false;
      this.isCustomBotFlowActive = false;

      // Send the final summary to chatwoot
      const tempMessage = createTemporaryMessage({ content: summary });
      await this.sendMessageWithData(tempMessage);

      // Now the conversation exists — apply the stored priority.
      if (this.flowState['priority']) {
        setPriorityAPI(this.flowState['priority']).catch(() => {});
      }

      this.flowMessages.push({
        id: Date.now(), sender: 'agent', type: 'options',
        title: "Thank you! We've received your request and our team will be in touch shortly.",
        options: [
          { id: 'start_over', action: 'start_over', title: 'Start Over' }
        ],
        hideFields: false,
      });
      // Chat input is permanently disabled as requested
    },

    async onOptionSelect(option, messageIndex) {
      // Mark current options as selected and hide choices
      this.flowMessages[messageIndex].selected = option.id;
      this.flowMessages[messageIndex].hideFields = true;

      // Append user response bubble
      this.flowMessages.push({
        id: Date.now(),
        sender: 'user',
        type: 'text',
        text: option.title,
      });

      this.isBotTyping = true;
      this.scrollToBottom();

      // Route to next step
      setTimeout(() => {
        this.isBotTyping = false;
        if (['quote', 'project', 'portfolio', 'services', 'exploring', 'any_of_the_above'].includes(option.id)) {
          this.flowState['user_intent'] = option.title;
          this.askServiceSelector();
        } else if (option.id === 'customer_support') {
          this.flowState['user_intent'] = 'Customer Support';
          this.isCustomerSupportMode = true;
          window.isCustomBotFlowActive = false;
          this.isCustomBotFlowActive = false;
          this.waitingForFreeInput = false;
          
          this.flowMessages.push({
            id: Date.now(), sender: 'agent', type: 'text',
            text: "Connecting you with customer support... Please type your message below to begin!",
          });
          
          emitter.emit(BUS_EVENTS.ENABLE_CHAT_INPUT);
        } else if (option.id === 'continue_services') {
          this.askServiceSelector();
        } else if (option.id === 'consultation') {
          this.flowState['user_intent'] = option.title;
          this.askConsultationIntro();
        } else if (option.id === 'contact') {
          this.flowState['user_intent'] = option.title;
          this.askContactInfo();
        } else if (option.action === 'service_selected') {
          this.flowState['project_type'] = option.title;
          this.askProjectBrief();
        } else if (option.id === 'discuss_project') {
          this.askProjectBrief();
        } else if (option.action === 'timeline_selected') {
          this.flowState['timeline'] = option.title;
          this.flowState['priority'] = this.getPriorityFromTimeline(option.title);
          this.askBudget();
        } else if (option.action === 'budget_selected') {
          this.flowState['budget_range'] = option.title;
          this.askEmail();
        } else if (option.action === 'referral_selected') {
          this.flowState['lead_source'] = option.title;
          this.askFinalConfirmation();
        } else if (option.action === 'book_meeting' || option.id === 'book_call_now') {
          this.submitToHubspot();
          window.open('https://meetings-na2.hubspot.com/kodexo', '_blank');
          this.askGoodbye();
        } else if (option.action === 'final_action') {
          this.submitToHubspot();
          this.askGoodbye();
        } else if (option.action === 'start_over') {
          localStorage.removeItem('kodexo_flow_completed');
          localStorage.removeItem('kodexo_flow_progress');
          this.flowState = {};
          window.isCustomBotFlowActive = true;
          this.isCustomBotFlowActive = true;
          this.askInitialIntent();
        }
        
        this.scrollToBottom();
      }, 600);
      this.scrollToBottom();
    },
  },
};
</script>

<template>
  <div class="conversation--container" :class="colorSchemeClass">
    <div class="conversation-wrap" :class="{ 'is-typing': isAgentTyping }">
      <div v-if="isFetchingList" class="message--loader">
        <Spinner />
      </div>
      <div
        v-for="groupedMessage in groupedMessages"
        :key="groupedMessage.date"
        class="messages-wrap"
      >
        <DateSeparator :date="groupedMessage.date" />
        <ChatMessage
          v-for="message in groupedMessage.messages"
          :key="message.id"
          :message="message"
          :class="{ 'hidden': message.content_type === 'input_email' || isCustomBotFlowActive || message.content?.includes('[SYSTEM_') || message.content?.includes('[LEAD_CONFIRMED]') }"
        />
      </div>

      <!-- Test Flow Messages -->
      <transition-group name="message-fade" tag="div" class="mt-4 space-y-3 px-2">
        <div v-for="(msg, index) in flowMessages" :key="msg.id">
          <!-- User Message -->
          <div
            v-if="msg.sender === 'user'"
            class="items-end flex justify-end ml-auto mb-1 mt-0 max-w-[85%] text-right"
          >
            <div class="text-n-slate-12 dark:text-white text-sm px-4 py-2.5">
              <p class="m-0 text-right font-medium">
                {{ msg.text }}
              </p>
            </div>
          </div>

          <!-- Agent Message -->
          <div v-else class="flex flex-col items-start max-w-[85%] mb-4">
            <!-- Text Bubble -->
            <div
              v-if="msg.type === 'text'"
              class="shadow rounded-[1.25rem] rounded-bl-[0.25rem] px-4 py-2.5 inline-block text-sm text-[#1f2937] bg-white w-fit"
            >
              <p class="m-0 whitespace-pre-wrap">
                {{ msg.text }}
              </p>
            </div>

            <!-- Options Bubble -->
            <div v-else-if="msg.type === 'options'" class="w-full">
              <div
                class="shadow rounded-[1.25rem] rounded-bl-[0.25rem] px-4 py-2.5 inline-block text-sm text-[#1f2937] bg-white w-full"
              >
                <h4 class="text-[#1f2937] text-sm font-normal my-1 leading-[1.5] whitespace-pre-wrap">
                  {{ msg.title }}
                </h4>
                <ul v-if="!msg.hideFields" class="flex flex-wrap gap-2 mt-2 w-full p-0 m-0">
                  <li
                    v-for="option in msg.options"
                    :key="option.id"
                    class="list-none rounded-[5rem] border border-solid m-0 max-w-full hover:bg-[#F54545] transition-colors border-[#F54545] group"
                  >
                    <button
                      class="bg-transparent border-0 cursor-pointer px-4 py-1.5 text-xs leading-normal rounded-[2rem] font-medium text-[#F54545] group-hover:text-white"
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
      </transition-group>

      <AgentTypingBubble v-if="showStatusIndicator" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.conversation--container {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  color-scheme: light dark;

  &.light-scheme {
    color-scheme: light;
  }

  &.dark-scheme {
    color-scheme: dark;
  }
}

.conversation-wrap {
  flex: 1;
  @apply px-2 pt-8 pb-2;
}

.message--loader {
  text-align: center;
}

.message-fade-enter-active,
.message-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.message-fade-enter-from,
.message-fade-leave-to {
  opacity: 0;
  transform: translateY(15px) scale(0.98);
}
</style>
