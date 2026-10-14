export function fallbackSupport(message: string): string {
    const text = message.toLowerCase();
    if (/outage|down|offline|no internet|not working/.test(text)) {
      return "Let’s get you back online. First, check that your router’s broadband light is steady and restart it by unplugging it for 30 seconds. You can also check the service status card on your dashboard. If the light is still red after five minutes, I can connect you with our support team.";
    }
    if (/slow|speed|buffer|lag/.test(text)) {
      return "A quick speed check can help narrow this down. Try testing near your router with a device connected over Wi-Fi, then restart the router for 30 seconds. If you share your package speed and test result, I can suggest a next step. Please avoid sharing account passwords or payment details here.";
    }
    if (/bill|billing|payment|charge|invoice/.test(text)) {
      return "I can help with general billing questions. Your latest invoice and payment date are available in My Account. For a specific charge or payment arrangement, our billing specialists can securely review your account. Would you like me to outline how to contact them?";
    }
    if (/router|wifi|wi-fi|wireless/.test(text)) {
      return "For better Wi-Fi coverage, place your router in an open, central position away from thick walls and other electronics. Restarting it can also clear temporary issues. Tell me which devices or rooms are affected and I’ll help troubleshoot.";
    }
    if (/cancel|complaint|human|agent|person|support team/.test(text)) {
      return "I can arrange for a Cheetah support specialist to help with that. Please use the secure contact option in My Account so the team can verify your details safely. You can also call us on 0800 014 2025, Monday to Saturday, 8am–8pm.";
    }
    return "Thanks for getting in touch with Cheetah Broadband. I can help with Wi-Fi, connection speeds, service issues and general billing questions. Could you tell me a little more about what’s happening? For account-specific help, I can point you to a support specialist.";
}