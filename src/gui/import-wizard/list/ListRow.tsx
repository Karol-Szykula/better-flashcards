import type {
  CSSProperties,
  JSX,
  MouseEvent,
  ReactNode,
} from "react";
import { listClasses } from "src/gui/import-wizard/listClasses";
import { mergeClasses } from "src/gui/import-wizard/classes";

export interface ListRowProps {
  cells: ReactNode[];
  className?: string;
  disabled?: boolean;
  onSelect?: () => void;
  style?: CSSProperties;
}

export function ListRow({
  cells,
  className,
  disabled = false,
  onSelect,
  style,
}: ListRowProps): JSX.Element {
  return (
    <div
      className={mergeClasses(listClasses.listRow, className)}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        const interactive = (event.target as HTMLElement).closest(
          "input, select, button, a"
        );
        if (!disabled && onSelect && !interactive) {
          onSelect();
        }
      }}
      style={style}
    >
      {cells.map((cell, index) => (
        <div className={listClasses.listCell} key={index}>
          {cell}
        </div>
      ))}
    </div>
  );
}

export interface LabeledControlProps {
  className?: string;
  control: ReactNode;
  label: ReactNode;
  tooltip?: string;
}

export function LabeledControl({
  control,
  label,
  tooltip,
  className,
}: LabeledControlProps): JSX.Element {
  return (
    <label
      className={mergeClasses(listClasses.labeledControl, className)}
      title={tooltip}
    >
      {control}
      <span>{label}</span>
    </label>
  );
}
