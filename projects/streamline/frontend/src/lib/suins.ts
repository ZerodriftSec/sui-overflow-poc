/**
 * Re-exports recipient resolve helpers from `@streamline/sdk`.
 * App code keeps importing `@/lib/suins`.
 */
export {
  resolveRecipient,
  reverseResolveHandle,
  isHandleTakenOnChain,
  candidateSuinsNames,
  type ResolvedRecipient,
} from "@streamline/sdk";
