/** Scripted-model helper: mount browse UI after a search_catalog result. */
export type PresentBrowseStep = {
  tool: "present_response";
  input: { catalog: { mode: "browse"; resultSetId: string } };
};

export function browsePresentAfterSearch(searchCallCount: number): PresentBrowseStep {
  return {
    tool: "present_response",
    input: { catalog: { mode: "browse", resultSetId: `call-${searchCallCount}` } },
  };
}
