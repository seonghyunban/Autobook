import { getAccessToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type EntityItem = {
  id: string;
  name: string;
  jurisdiction: string;
  fiscal_year_end: string;
};

type EntitiesResponse = {
  entities: EntityItem[];
};

export async function fetchEntities(): Promise<EntityItem[]> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Missing access token.");
  }

  const response = await fetch(`${API_BASE_URL}/entities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch entities: ${response.status}`);
  }
  const data = (await response.json()) as EntitiesResponse;
  return data.entities;
}

export async function createEntity(name: string): Promise<EntityItem> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Missing access token.");
  }

  const response = await fetch(`${API_BASE_URL}/entities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create entity: ${response.status}`);
  }
  return (await response.json()) as EntityItem;
}
