import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";

interface Props {
  tag: string;
  active?: boolean;
  onClick?: (tag: string) => void;
}

export function TagChip({ tag, active, onClick }: Props) {
  const theme = useCurrentTheme();
  const { bg, fg } = chipColor(tag, theme);
  const style = {
    background: bg,
    color: fg,
  } as React.CSSProperties;

  return (
    <button
      type="button"
      className={`chip${active ? " chip-active" : ""}`}
      style={style}
      onClick={onClick ? () => onClick(tag) : undefined}
      title={`Filter by /${tag}`}
    >
      <span className="chip-slash">/</span>
      {tag}
    </button>
  );
}
