import { z } from "zod";
import { CONFIG, configSourceLabel } from "../config.mjs";
import { respondText, wrapToolHandler } from "../helpers.mjs";
import { createCard, connectCards, listCardTypes, prepareCardPayload, sanitizeCardInput, validateCardTypeId } from "../api/agileplace.mjs";

const { DEFAULT_BOARD_ID, MAX_CARDS, STORY_LIMIT } = CONFIG;

export function registerHierarchyTools(mcp) {
  // Create Epic hierarchy (Epic -> Features -> Stories)
  mcp.registerTool(
    "createEpicHierarchy",
    {
      description: "Create a complete Epic -> Features -> Stories hierarchy in one operation. Each feature can have multiple stories as children. Use listCardTypes to get valid cardTypeId values.",
      inputSchema: {
        boardId: z.string().optional(),
        dryRun: z.boolean().optional(),
        epic: z.object({
          title: z.string(),
          description: z.string().optional(),
          plannedStartDate: z.string().optional(),
          plannedFinishDate: z.string().optional(),
          isHeader: z.boolean().optional(),
          cardHeader: z.string().optional(),
          cardTypeId: z.string().optional(),
          cardTypeName: z.string().optional(),
        }),
        features: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          plannedStartDate: z.string().optional(),
          plannedFinishDate: z.string().optional(),
          isHeader: z.boolean().optional(),
          cardHeader: z.string().optional(),
          cardTypeId: z.string().optional(),
          cardTypeName: z.string().optional(),
          stories: z.array(z.object({
            title: z.string(),
            description: z.string().optional(),
            plannedStartDate: z.string().optional(),
            plannedFinishDate: z.string().optional(),
            isHeader: z.boolean().optional(),
            cardHeader: z.string().optional(),
            cardTypeId: z.string().optional(),
            cardTypeName: z.string().optional(),
          })).optional(),
        })),
      },
    },
    wrapToolHandler("createEpicHierarchy", async ({ boardId, epic, features, dryRun }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
      }

      const limitedFeatures = Array.isArray(features) ? features.slice(0, MAX_CARDS) : [];
      if (Array.isArray(features) && features.length > limitedFeatures.length) {
        console.warn(`createEpicHierarchy: trimming features array to MAX_CARDS (${MAX_CARDS}).`);
      }

      const storyLimit = STORY_LIMIT;

      if (dryRun) {
        const epicPreview = await prepareCardPayload(
          { ...epic, boardId: resolvedBoardId },
          { resolveTypeName: false }
        );

        const featuresPreview = [];
        for (const feature of limitedFeatures) {
          const featurePreview = await prepareCardPayload(
            { ...feature, boardId: resolvedBoardId },
            { resolveTypeName: false }
          );
          const originalStories = Array.isArray(feature.stories) ? feature.stories : [];
          const limitedStories = originalStories.slice(0, storyLimit).map(story => {
            const sanitizedStory = sanitizeCardInput(story);
            return {
              title: sanitizedStory.title,
              description: sanitizedStory.description,
              cardTypeId: validateCardTypeId(story.cardTypeId) ?? null,
              cardTypeName: story.cardTypeName ?? null,
              tags: sanitizedStory.tags || [],
            };
          });

          if (originalStories.length > limitedStories.length) {
            console.warn(`createEpicHierarchy dryRun: trimming stories array for feature ${featurePreview.sanitized.title} to STORY_LIMIT (${storyLimit}).`);
          }

          featuresPreview.push({
            title: featurePreview.sanitized.title,
            description: featurePreview.sanitized.description,
            cardTypeId: featurePreview.body.typeId ?? feature.cardTypeId ?? null,
            cardTypeName: feature.cardTypeName ?? null,
            tags: featurePreview.sanitized.tags || [],
            stories: limitedStories,
          });
        }

        return respondText(
          `Dry run: would create epic "${epicPreview.sanitized.title}" with ${featuresPreview.length} feature(s)`,
          `Details:\n${JSON.stringify(
            {
              dryRun: true,
              wouldCreate: {
                epic: {
                  title: epicPreview.sanitized.title,
                  description: epicPreview.sanitized.description,
                  cardTypeId: epicPreview.body.typeId ?? epic.cardTypeId ?? null,
                  cardTypeName: epic.cardTypeName ?? null,
                  tags: epicPreview.sanitized.tags || [],
                },
                features: featuresPreview,
              },
            },
            null,
            2
          )}`
        );
      }

      try {
        // Step 1: Create Epic
        const epicCard = await createCard({
          boardId: resolvedBoardId,
          title: epic.title,
          description: epic.description || "",
          plannedStartDate: epic.plannedStartDate,
          plannedFinishDate: epic.plannedFinishDate,
          isHeader: epic.isHeader,
          cardHeader: epic.cardHeader,
          cardTypeId: epic.cardTypeId,
          cardTypeName: epic.cardTypeName
        });

        // Step 2: Create Features and connect to Epic
        const featureCards = [];
        for (const feature of limitedFeatures) {
          const featureCard = await createCard({
            boardId: resolvedBoardId,
            title: feature.title,
            description: feature.description || "",
            plannedStartDate: feature.plannedStartDate,
            plannedFinishDate: feature.plannedFinishDate,
            isHeader: feature.isHeader,
            cardHeader: feature.cardHeader,
            cardTypeId: feature.cardTypeId,
            cardTypeName: feature.cardTypeName
          });
          featureCards.push(featureCard);
        }

        // Connect features to epic
        await connectCards(epicCard.id, featureCards.map(c => c.id));

        // Step 3: For each feature, create and connect stories
        for (let i = 0; i < featureCards.length; i++) {
          const featureCard = featureCards[i];
          const sourceFeature = limitedFeatures[i];
          const originalStories = Array.isArray(sourceFeature?.stories) ? sourceFeature.stories : [];
          const featureStories = originalStories.slice(0, storyLimit);
          if (originalStories.length > featureStories.length) {
            console.warn(`createEpicHierarchy: trimming stories array for feature ${featureCard.title} to STORY_LIMIT (${storyLimit}).`);
          }

          if (featureStories.length > 0) {
            // Create stories for this feature
            const storyCards = [];
            for (const story of featureStories) {
              const createdStory = await createCard({
                boardId: resolvedBoardId,
                title: story.title,
                description: story.description || "",
                plannedStartDate: story.plannedStartDate,
                plannedFinishDate: story.plannedFinishDate,
                isHeader: story.isHeader,
                cardHeader: story.cardHeader,
                cardTypeId: story.cardTypeId,
                cardTypeName: story.cardTypeName
              });
              storyCards.push(createdStory);
            }

            // Connect stories to the feature
            await connectCards(featureCard.id, storyCards.map(c => c.id));
          }
        }

        const totalFeatures = limitedFeatures.length;
        const totalStories = limitedFeatures.reduce(
          (total, f) => total + (Array.isArray(f.stories) ? Math.min(f.stories.length, storyLimit) : 0),
          0
        );

        return respondText(
          `Created Epic hierarchy: "${epic.title}" with ${totalFeatures} features and ${totalStories} stories`,
          `Details:\n${JSON.stringify(
            {
              epic: { id: epicCard.id, title: epicCard.title },
              features: featureCards.map(f => ({ id: f.id })),
            },
            null,
            2
          )}`
        );
      } catch (error) {
        throw new Error(`Failed to create Epic hierarchy: ${error?.message || error}`, { cause: error });
      }
    })
  );
}
