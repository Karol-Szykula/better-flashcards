import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { mergeClasses } from "src/gui/classes";
import { listClasses } from "src/gui/import-wizard/listClasses";

export interface ListRowProps {
  readonly cells: ReactNode[];
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
  readonly style?: CSSProperties;
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
          "input, select, button, a",
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
  readonly className?: string;
  readonly control: ReactNode;
  readonly controlLabel?: string;
  readonly disabled?: boolean;
  readonly label: ReactNode;
  readonly tooltip?: string;
}

function accessibleControl(
  control: ReactNode,
  controlLabel?: string,
): ReactNode {
  return isValidElement(control) && controlLabel !== undefined
    ? cloneElement(control as ReactElement<Record<string, unknown>>, {
        "aria-label": controlLabel,
      })
    : control;
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
          className,
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
