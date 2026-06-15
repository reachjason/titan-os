import { hueForTag } from "../commands/registry";

interface Props {
  tag: string;
  active?: boolean;
  onClick?: (tag: string) => void;
}

export function TagChip({ tag, active, onClick }: Props) {
  const hue = hueForTag(tag);
  const style = {
    "--chip-hue": hue,
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
