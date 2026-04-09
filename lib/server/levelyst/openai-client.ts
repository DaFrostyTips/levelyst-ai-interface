import OpenAI from "openai"
import { isLevelystDemoMode, isLevelystPublicMode } from "./deploy-mode"

export type PlannerProviderKind = "openai" | "rule_based"

export interface PlannerRuntimeConfig {
  provider: PlannerProviderKind
  model: string
  maxRetries: number
}

const DEFAULT_PROVIDER: PlannerProviderKind = "rule_based"
const DEFAULT_MODEL = "gpt-5-mini"
const DEFAULT_MAX_RETRIES = 3

export function getPlannerRuntimeConfig(): PlannerRuntimeConfig {
  if (isLevelystDemoMode()) {
    return {
      provider: "rule_based",
      model: process.env.LEVELYST_OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      maxRetries: DEFAULT_MAX_RETRIES,
    }
  }

  if (isLevelystPublicMode()) {
    const model = process.env.LEVELYST_OPENAI_MODEL?.trim() || DEFAULT_MODEL
    const parsedRetries = Number.parseInt(process.env.LEVELYST_PLANNER_MAX_RETRIES ?? "", 10)
    const maxRetries = Number.isFinite(parsedRetries) && parsedRetries > 0 ? parsedRetries : DEFAULT_MAX_RETRIES

    return {
      provider: "rule_based",
      model,
      maxRetries,
    }
  }

  const provider =
    process.env.LEVELYST_PLANNER_PROVIDER === "openai"
      ? "openai"
      : process.env.LEVELYST_PLANNER_PROVIDER === "rule_based"
        ? "rule_based"
        : DEFAULT_PROVIDER

  const model = process.env.LEVELYST_OPENAI_MODEL?.trim() || DEFAULT_MODEL
  const parsedRetries = Number.parseInt(process.env.LEVELYST_PLANNER_MAX_RETRIES ?? "", 10)
  const maxRetries = Number.isFinite(parsedRetries) && parsedRetries > 0 ? parsedRetries : DEFAULT_MAX_RETRIES

  return {
    provider,
    model,
    maxRetries,
  }
}

export function createLevelystOpenAIClient() {
  if (isLevelystDemoMode()) {
    return null
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  return new OpenAI({ apiKey })
}
