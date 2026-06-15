interface Props {
  label: string;
}

export function DateDivider({ label }: Props) {
  return (
    <div className="date-divider">
      <span>{label}</span>
    </div>
  );
}
