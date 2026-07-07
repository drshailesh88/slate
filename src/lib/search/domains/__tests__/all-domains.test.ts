import { describe, expect, it } from "vitest";

import { JOURNAL_FEEDS } from "@/data/journal-feeds";
import type { DomainConfig, DomainId } from "../types";
import { getDomainConfig, getRegisteredDomains } from "../registry";

const ALL_DOMAIN_IDS: DomainId[] = [
  "medicine",
  "biology",
  "physics",
  "chemistry",
  "computer_science",
  "engineering",
  "mathematics",
  "social_sciences",
  "economics",
  "psychology",
  "law",
  "humanities",
  "education",
  "environmental",
  "multidisciplinary",
];

function assertRequiredDomainFields(config: DomainConfig) {
  expect(config.id).toBeTruthy();
  expect(config.label).toBeTruthy();
  expect(config.description).toBeTruthy();
  expect(config.sources.length).toBeGreaterThan(0);
  expect(config.personas.librarian).toBeTruthy();
  expect(config.personas.researcher).toBeTruthy();
  expect(config.personas.textbook).toBeTruthy();
  expect(config.querySyntaxHints).toBeTruthy();
  expect(config.queryExample).toBeDefined();
  expect(config.evidenceHierarchy).toHaveLength(5);
  expect(config.studyTypePatterns).toBeDefined();
  expect(config.filterOptions.length).toBeGreaterThan(0);
  expect(config.synonymMap).toBeDefined();
  expect(config.perspectiveTemplates).toBeDefined();
  expect(config.posterTemplates.length).toBeGreaterThan(0);
  expect(config.journalCategories.length).toBeGreaterThan(0);
  expect(config.feedsSummaryPrompt).toBeTruthy();
  expect(config.presentationStudyDesigns).toBeTruthy();
  expect(config.calloutType.id).toBeTruthy();
  expect(config.calloutType.label).toBeTruthy();
  expect(config.features.presentationTypes.length).toBeGreaterThan(0);
}

describe("all domain configs", () => {
  it("registers all 15 domains", () => {
    expect(getRegisteredDomains().sort()).toEqual([...ALL_DOMAIN_IDS].sort());
  });

  it("returns the correct config for each domain id", () => {
    for (const domainId of ALL_DOMAIN_IDS) {
      expect(getDomainConfig(domainId).id).toBe(domainId);
    }
  });

  it("ensures every domain config has the required populated fields", () => {
    for (const domainId of ALL_DOMAIN_IDS) {
      assertRequiredDomainFields(getDomainConfig(domainId));
    }
  });

  it("ensures every domain has at least one source", () => {
    for (const domainId of ALL_DOMAIN_IDS) {
      expect(getDomainConfig(domainId).sources.length).toBeGreaterThan(0);
    }
  });

  it("ensures every domain has exactly five evidence levels", () => {
    for (const domainId of ALL_DOMAIN_IDS) {
      expect(getDomainConfig(domainId).evidenceHierarchy).toHaveLength(5);
    }
  });

  it("keeps proven deep research enabled for medicine and biology only", () => {
    expect(getDomainConfig("medicine").useProvenDeepResearch).toBe(true);
    expect(getDomainConfig("biology").useProvenDeepResearch).toBe(true);
    expect(getDomainConfig("physics").useProvenDeepResearch).toBe(false);
  });

  it("keeps systematic review flags aligned with domain requirements", () => {
    expect(getDomainConfig("medicine").features.systematicReview).toBe(true);
    expect(getDomainConfig("physics").features.systematicReview).toBe(false);
    expect(getDomainConfig("psychology").features.systematicReview).toBe(true);
  });

  it("ensures every feed-enabled domain has at least 10 matching curated journal feeds", () => {
    for (const domainId of ALL_DOMAIN_IDS) {
      const domain = getDomainConfig(domainId);
      if (!domain.features.journalFeeds) {
        continue;
      }

      const matchingFeeds = JOURNAL_FEEDS.filter((feed) =>
        domain.journalCategories.includes(feed.category)
      );

      expect(matchingFeeds.length).toBeGreaterThanOrEqual(10);
    }
  });
});
