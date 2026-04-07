export interface WorkspaceTemplate {
  id: string;
  name: string;
  color: string;
  urlPatterns: string[];
}

export interface WorkspaceItem {
  id: string;
  name: string;
  color: string;
  urlPatterns: string[];
}

export const workspaceTemplates: WorkspaceTemplate[] = [
  {
    id: "work",
    name: "templateWorkName",
    color: "#6366f1",
    urlPatterns: [
      "google.com/docs",
      "notion.so",
      "figma.com",
      "github.com",
      "gitlab.com",
      "slack.com",
      "linear.app"
    ]
  },
  {
    id: "social",
    name: "templateSocialName",
    color: "#ec4899",
    urlPatterns: ["twitter.com", "x.com", "reddit.com", "facebook.com", "instagram.com", "linkedin.com"]
  },
  {
    id: "shopping",
    name: "templateShoppingName",
    color: "#f59e0b",
    urlPatterns: ["amazon.com", "taobao.com", "jd.com", "ebay.com", "etsy.com"]
  },
  {
    id: "learning",
    name: "templateLearningName",
    color: "#10b981",
    urlPatterns: ["youtube.com", "udemy.com", "coursera.org", "zhihu.com", "medium.com", "stackoverflow.com"]
  },
  {
    id: "entertainment",
    name: "templateEntertainmentName",
    color: "#8b5cf6",
    urlPatterns: ["netflix.com", "bilibili.com", "twitch.tv", "spotify.com"]
  }
];

export function createWorkspacesFromTemplates(selectedTemplateIds: string[]): WorkspaceItem[] {
  const selected = workspaceTemplates.filter((template) => selectedTemplateIds.includes(template.id));
  return selected.map((template) => ({
    id: `${template.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: template.name,
    color: template.color,
    urlPatterns: template.urlPatterns
  }));
}
