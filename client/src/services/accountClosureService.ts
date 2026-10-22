import type { AxiosRequestConfig } from "axios";
import api from "./api";

// The Close workspace card shows its own messages, so skip the global axios toasts.
const silent = { _silent: true } as AxiosRequestConfig;

export type ClosureStatus = "none" | "pending" | "canceled";

export interface WorkspaceClosure {
  slug: string;
  name: string;
  closure: {
    status: ClosureStatus;
    requestedAt?: string | null;
    requestedBy?: { name: string; email: string } | null;
    exportUntil?: string | null;
    deleteAfter?: string | null;
    canceledAt?: string | null;
  };
}

const getClosure = async (): Promise<WorkspaceClosure> => {
  const response = await api.get("/account/closure", silent);
  return response.data.data as WorkspaceClosure;
};

const requestClosure = async (
  confirmation: string,
): Promise<WorkspaceClosure> => {
  const response = await api.post("/account/closure", { confirmation }, silent);
  return response.data.data as WorkspaceClosure;
};

const cancelClosure = async (): Promise<WorkspaceClosure> => {
  const response = await api.delete("/account/closure", silent);
  return response.data.data as WorkspaceClosure;
};

export default { getClosure, requestClosure, cancelClosure };

export interface WorkspaceArchiveItem {
  id: string;
  status: "building" | "ready" | "failed" | "deleted";
  reason: "closure" | "on_demand";
  createdAt: string;
  readyAt?: string | null;
  bytes: number;
  filesMode: "included" | "links" | "partial" | "none" | "";
  fileCount: number;
  documentCount: number;
  downloadUrl: string | null;
}

export interface WorkspaceArchives {
  available: boolean;
  canRequest: boolean;
  archives: WorkspaceArchiveItem[];
}

const getArchives = async (): Promise<WorkspaceArchives> => {
  const response = await api.get("/account/archive", silent);
  return response.data.data as WorkspaceArchives;
};

const createArchive = async (): Promise<WorkspaceArchiveItem> => {
  const response = await api.post("/account/archive", {}, silent);
  return response.data.data as WorkspaceArchiveItem;
};

export const archiveService = { getArchives, createArchive };
