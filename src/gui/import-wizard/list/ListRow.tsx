import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
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
  controlLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  tooltip?: string;
}

function accessibleControl(
  control: ReactNode,
  controlLabel?: string
): ReactNode {
  if (!controlLabel || !isValidElement(control)) {
    return control;
  }
  return cloneElement(control as ReactElement<Record<string, unknown>>, {
    "aria-label": controlLabel,
  });
}

export function LabeledControl({
  control,
  controlLabel,
  disabled = false,
  label,
  tooltip,
  className,
}: LabeledControlProps): JSX.Element {
  if (disabled) {
    return (
      <span
        className={mergeClasses(
          listClasses.labeledControl,
          listClasses.labeledControlDisabled,
          className
        )}
        title={tooltip}
      >
        {accessibleControl(control, controlLabel)}
        <span>{label}</span>
      </span>
    );
  }
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
