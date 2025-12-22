/**
 * AgilePlace Card Type Constants
 * These IDs are specific to the Visa 2026-2027 roadmap board
 * Use listCardTypes to get card types for other boards
 */
export const CARD_TYPES = {
  INITIATIVE: "2227070079",
  EPIC: "2044073078",
  DEPENDENCY: "2262837540",
  SUBTASK: "2044073084"
};

/**
 * Visa 2026-2027 Roadmap Configuration
 * Example structure for creating strategic planning cards
 */
export const VISA_2026_2027_ROADMAP = {
  boardId: "2044073077",
  initiatives: [
    {
      title: "Intelligent Commerce Ecosystem",
      cardTypeId: CARD_TYPES.INITIATIVE,
      epics: [
        {
          title: "Network-Scale AI Intelligence Platform",
          cardTypeId: CARD_TYPES.EPIC,
          description: "Build Visa's real-time fraud detection and payment optimization engine..."
        },
        {
          title: "Omnichannel Payment Orchestration",
          cardTypeId: CARD_TYPES.EPIC,
          description: "Enable seamless Visa payments across digital, mobile, in-app, and physical channels..."
        }
      ]
    },
    {
      title: "Developer-First Embedded Finance Platform",
      cardTypeId: CARD_TYPES.INITIATIVE,
      epics: [
        {
          title: "Open Payment APIs & Integration Framework",
          cardTypeId: CARD_TYPES.EPIC,
          description: "Develop standardized, developer-friendly APIs..."
        },
        {
          title: "Embedded Finance Marketplace & Partnerships",
          cardTypeId: CARD_TYPES.EPIC,
          description: "Create ecosystem platform where ISVs build and monetize solutions..."
        }
      ]
    }
  ]
};

