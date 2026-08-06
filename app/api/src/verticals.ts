export type VerticalStatus = "live" | "coming_soon";

export type FieldType = "text" | "select" | "yes_no" | "multi_select" | "textarea";

export interface IntakeField {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
}

export interface VerticalConfig {
  slug: string;
  label: string;
  status: VerticalStatus;
  // Emoji/character used as a cheap icon until custom assets are added.
  icon: string;
  serviceOptions: string[];
  intakeFields: IntakeField[];
  defaultServices: string[];
  defaultGreeting: string;
  tone: "warm" | "polished" | "restrained" | "clinical";
  // Prompt injected into the agent's global context.
  systemPromptTemplate: string;
  // Examples shown to the caller during the live demo.
  suggestedCallerScripts: string[];
  // Used in follow-up emails.
  emailCaseStudy: string;
  // Average booking value, used in ROI copy.
  missedCallValue: number;
}

export const VERTICALS: VerticalConfig[] = [
  {
    slug: "salon",
    label: "Hair / beauty salon",
    status: "live",
    icon: "✂️",
    serviceOptions: [
      "Cut & blow-dry",
      "Colour / balayage",
      "Highlights",
      "Treatments",
      "Bridal / event styling",
      "Extensions",
    ],
    defaultServices: ["Cut & blow-dry", "Colour / balayage"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — are you calling to book an appointment?",
    tone: "warm",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a hair and beauty salon.
Use a warm, friendly tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Answer general questions about services and pricing. Be honest when you don't know something and offer to have a team member follow up.`,
    suggestedCallerScripts: [
      "How much is a balayage?",
      "Do you have availability this Saturday?",
      "Can I book a bridal hair trial?",
      "What treatments do you offer for damaged hair?",
    ],
    intakeFields: [
      {
        name: "deposit_required",
        label: "Do you require a deposit for new clients?",
        type: "yes_no",
      },
      {
        name: "new_client_wait",
        label: "Typical wait for a new client",
        type: "select",
        options: ["Same week", "1-2 weeks", "3+ weeks"],
      },
    ],
    emailCaseStudy:
      "A salon in Manchester recovered 12 missed calls in the first week — worth about £1,020 in colour and cut bookings.",
    missedCallValue: 85,
  },
  {
    slug: "pmu",
    label: "PMU studio",
    status: "live",
    icon: "✨",
    serviceOptions: [
      "Microblading",
      "Powder brows",
      "Lip blush",
      "Eyeliner",
      "Touch-up",
      "Consultation",
    ],
    defaultServices: ["Microblading", "Powder brows"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — are you looking to book a PMU treatment or a consultation?",
    tone: "polished",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a permanent makeup studio.
Use a polished, reassuring tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Most PMU treatments require a consultation first. Explain this gently. Answer questions about deposits, aftercare, and booking.`,
    suggestedCallerScripts: [
      "Do I need a consultation first?",
      "How much is the deposit?",
      "Can I book microblading for next Saturday?",
      "What's the aftercare like?",
    ],
    intakeFields: [
      {
        name: "consultation_required",
        label: "Consultation required before booking?",
        type: "select",
        options: ["Yes", "No", "Optional"],
      },
      {
        name: "deposit_amount",
        label: "Deposit amount (e.g. $100 non-refundable)",
        type: "text",
      },
    ],
    emailCaseStudy:
      "A PMU studio saved 4 hours a week on repetitive consultation calls and converted 60% of enquiries into booked consultations.",
    missedCallValue: 150,
  },
  {
    slug: "spa",
    label: "Spa / massage",
    status: "live",
    icon: "🧖",
    serviceOptions: [
      "Massage",
      "Facials",
      "Body treatments",
      "Packages",
      "Memberships",
      "Gift cards",
    ],
    defaultServices: ["Massage", "Facials"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — are you booking a spa treatment or buying a gift card?",
    tone: "warm",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a spa and massage studio.
Use a warm, relaxed tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Mention packages and memberships when relevant. Do not invent availability.`,
    suggestedCallerScripts: [
      "Do you sell memberships?",
      "Can I book a couples massage?",
      "What facials do you offer?",
      "Do you have gift cards?",
    ],
    intakeFields: [
      {
        name: "memberships",
        label: "Do you sell memberships or packages?",
        type: "yes_no",
      },
      {
        name: "group_bookings",
        label: "Do you take couples or group bookings?",
        type: "yes_no",
      },
    ],
    emailCaseStudy:
      "A day spa increased package upsells by 22% by answering after-hours calls that previously went to voicemail.",
    missedCallValue: 120,
  },
  {
    slug: "nail_lash",
    label: "Nail / lash / brow studio",
    status: "live",
    icon: "💅",
    serviceOptions: [
      "Gel nails",
      "Acrylics",
      "Nail art",
      "Lash extensions",
      "Brow shaping",
      "Lash lift",
    ],
    defaultServices: ["Gel nails", "Lash extensions"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — are you looking to book nails, lashes, or brows?",
    tone: "warm",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a nail, lash and brow studio.
Use a warm, upbeat tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Answer questions about services and timing. Do not make up prices unless given.`,
    suggestedCallerScripts: [
      "How long do acrylics take?",
      "Can I book a lash fill?",
      "Do you take walk-ins?",
      "What brow services do you offer?",
    ],
    intakeFields: [
      {
        name: "walk_ins",
        label: "Do you accept walk-ins?",
        type: "yes_no",
      },
      {
        name: "new_client_deposit",
        label: "Do new clients pay a deposit?",
        type: "yes_no",
      },
    ],
    emailCaseStudy:
      "A lash studio cut no-shows in half by collecting deposits over the phone automatically.",
    missedCallValue: 75,
  },
  {
    slug: "barber",
    label: "Barbershop",
    status: "live",
    icon: "💈",
    serviceOptions: [
      "Cut",
      "Beard trim",
      "Hot towel shave",
      "Skin fade",
      "Kids cut",
      "Walk-in",
    ],
    defaultServices: ["Cut", "Skin fade"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — do you want to book a cut or just walk in?",
    tone: "warm",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a barbershop.
Use a warm, casual tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Handle walk-in vs appointment questions. Keep responses short and friendly.`,
    suggestedCallerScripts: [
      "Do you take walk-ins?",
      "Can I book a skin fade for today?",
      "How much is a beard trim?",
      "Do you cut kids' hair?",
    ],
    intakeFields: [
      {
        name: "appointments_preferred",
        label: "Do you prefer appointments over walk-ins?",
        type: "yes_no",
      },
      {
        name: "online_booking",
        label: "Do you offer online booking?",
        type: "yes_no",
      },
    ],
    emailCaseStudy:
      "A barbershop filled 30% more chairs by answering overflow calls during busy Saturday mornings.",
    missedCallValue: 35,
  },
  {
    slug: "dental",
    label: "Dental clinic",
    status: "coming_soon",
    icon: "🦷",
    serviceOptions: ["Check-up", "Hygiene", "Whitening", "Fillings", "Orthodontics"],
    defaultServices: ["Check-up", "Hygiene"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — how can I help with your dental enquiry?",
    tone: "clinical",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a dental clinic.
Use a calm, clinical tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Do not give medical advice. Triage enquiries and book consultations.`,
    suggestedCallerScripts: [
      "How do I book a check-up?",
      "Do you take new patients?",
      "What whitening options do you offer?",
    ],
    intakeFields: [
      {
        name: "new_patients",
        label: "Are you accepting new patients?",
        type: "select",
        options: ["Yes", "No", "Waitlist"],
      },
      {
        name: "insurance",
        label: "Insurance accepted",
        type: "multi_select",
        options: ["Delta Dental", "Cigna", "MetLife", "Other", "None"],
      },
    ],
    emailCaseStudy:
      "A dental clinic recovered 18 after-hours appointment requests in the first month.",
    missedCallValue: 200,
  },
  {
    slug: "medspa",
    label: "Med-spa / aesthetics",
    status: "coming_soon",
    icon: "💉",
    serviceOptions: ["Injectables", "Laser", "Facials", "Consultation", "Packages"],
    defaultServices: ["Injectables", "Laser"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — are you interested in a treatment or a consultation?",
    tone: "polished",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a med-spa and aesthetics clinic.
Use a polished, reassuring tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Do not give medical advice. Explain that consultations are required for treatments.`,
    suggestedCallerScripts: [
      "How much are injectables?",
      "Do I need a consultation first?",
      "What laser treatments do you offer?",
    ],
    intakeFields: [
      {
        name: "contraindications",
        label: "Do you screen for contraindications before booking?",
        type: "yes_no",
      },
      {
        name: "provider_on_site",
        label: "Is a medical provider on-site for treatments?",
        type: "yes_no",
      },
    ],
    emailCaseStudy:
      "A med-spa converted 40% more consultation calls into booked appointments.",
    missedCallValue: 350,
  },
  {
    slug: "mental_health",
    label: "Therapy / psychiatry practice",
    status: "coming_soon",
    icon: "🧠",
    serviceOptions: ["Therapy", "Psychiatry", "Crisis support", "New patient intake"],
    defaultServices: ["Therapy", "New patient intake"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — are you looking to book a session or speak to someone?",
    tone: "restrained",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a therapy and psychiatry practice.
Use a restrained, empathetic tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
If a caller sounds in crisis, escalate immediately to a human line. Do not give medical advice.`,
    suggestedCallerScripts: [
      "Do you accept new patients?",
      "What insurance do you take?",
      "Can I book a first session?",
    ],
    intakeFields: [
      {
        name: "crisis_escalation",
        label: "Do you have a 24/7 crisis line?",
        type: "yes_no",
      },
      {
        name: "new_patients",
        label: "Are you accepting new patients?",
        type: "select",
        options: ["Yes", "No", "Waitlist"],
      },
    ],
    emailCaseStudy:
      "A therapy practice reduced intake-call bottlenecks and captured 50% more new-patient enquiries.",
    missedCallValue: 150,
  },
  {
    slug: "vet",
    label: "Veterinary clinic",
    status: "coming_soon",
    icon: "🐕",
    serviceOptions: ["Check-up", "Vaccinations", "Surgery", "Emergency", "Grooming"],
    defaultServices: ["Check-up", "Vaccinations"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — do you need to book an appointment or is this an emergency?",
    tone: "warm",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a veterinary clinic.
Use a warm, calm tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
If the caller says it is an emergency, escalate immediately. Do not give medical advice.`,
    suggestedCallerScripts: [
      "My dog is limping — can I be seen today?",
      "Do you take emergencies?",
      "When are you open?",
    ],
    intakeFields: [
      {
        name: "emergencies",
        label: "Do you take emergencies?",
        type: "select",
        options: ["Yes", "Refer out", "After-hours only"],
      },
      {
        name: "new_patient_exam",
        label: "Do new patients need an exam before procedures?",
        type: "yes_no",
      },
    ],
    emailCaseStudy:
      "A vet clinic routed after-hours emergencies correctly and saved 3 critical calls in the first week.",
    missedCallValue: 120,
  },
  {
    slug: "funeral",
    label: "Funeral home",
    status: "coming_soon",
    icon: "🕊️",
    serviceOptions: ["Immediate need", "Pre-planning", "Memorial services", "Grief support"],
    defaultServices: ["Immediate need", "Pre-planning"],
    defaultGreeting:
      "Thank you for calling {business_name}, this is Ava — I am here to help. Is this an immediate-need call?",
    tone: "restrained",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a funeral home.
Use a restrained, gentle tone. Never use excited or salesy language.
Services offered: {services}.
{vertical_context}
Business location: {location}.
If the call is an immediate need, offer to connect a human immediately. Be patient and respectful.`,
    suggestedCallerScripts: [
      "I need to arrange a funeral today.",
      "Do you offer pre-planning?",
      "What should I bring to the appointment?",
    ],
    intakeFields: [
      {
        name: "immediate_need_24_7",
        label: "Are immediate-need calls answered 24/7?",
        type: "yes_no",
      },
      {
        name: "pre_planning",
        label: "Do you offer pre-planning consultations?",
        type: "yes_no",
      },
    ],
    emailCaseStudy:
      "A funeral home gave grieving families an immediate, calm first point of contact at any hour.",
    missedCallValue: 0,
  },
  {
    slug: "home_services",
    label: "Home services (HVAC, plumbing)",
    status: "coming_soon",
    icon: "🔧",
    serviceOptions: ["Repair", "Maintenance", "Installation", "Emergency", "Quote"],
    defaultServices: ["Repair", "Maintenance"],
    defaultGreeting:
      "Hi, thanks for calling {business_name}, this is Ava — what can we help you with at your home?",
    tone: "polished",
    systemPromptTemplate: `You are Ava, the AI receptionist for {business_name}, a home services company.
Use a polished, helpful tone.
Services offered: {services}.
{vertical_context}
Business location: {location}.
Capture the issue and address. If it is an emergency, escalate. Do not quote prices without context.`,
    suggestedCallerScripts: [
      "My AC is broken — can someone come today?",
      "Do you offer maintenance plans?",
      "How much is a quote?",
    ],
    intakeFields: [
      {
        name: "emergency_after_hours",
        label: "Do you take emergency after-hours calls?",
        type: "yes_no",
      },
      {
        name: "service_area",
        label: "Service area / cities",
        type: "text",
      },
    ],
    emailCaseStudy:
      "An HVAC company captured 20% more after-hours emergency calls and reduced dispatch delays.",
    missedCallValue: 250,
  },
];

export const VERTICALS_BY_SLUG = new Map(VERTICALS.map((v) => [v.slug, v]));

export function getVertical(slug: string): VerticalConfig | undefined {
  return VERTICALS_BY_SLUG.get(slug);
}
