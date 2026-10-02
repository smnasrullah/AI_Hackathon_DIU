import { api } from "./api";

/** GET a file through the authed client and hand it to the browser as a download. */
export async function downloadFile(path: string, params: Record<string, unknown>, filename: string): Promise<void> {
  const res = await api.get<Blob>(path, { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
