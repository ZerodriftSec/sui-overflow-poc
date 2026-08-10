export interface SuiMoveEvent {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson?: Record<string, unknown>;
  bcs?: string;
}

export interface IndexedSuiEvent {
  eventKey: string;
  chainId: number;
  name: string;
  txDigest: string;
  eventSeq: string;
  payload: Record<string, unknown>;
  observedAt: string;
}

export interface IndexCursor {
  chainId: number;
  packageId: string;
  lastTxDigest: string | null;
  lastEventSeq: string | null;
  updatedAt: string;
}
