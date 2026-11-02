export type Theme = {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  font: string;
};

export type SceneProps = {
  template: 'stat' | 'engines' | 'bullets';
  duration: number;
  fps: number;
  width: number;
  height: number;
  theme: Theme;
  data: Record<string, any>;
};
