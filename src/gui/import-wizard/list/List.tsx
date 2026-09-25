import type { JSX, ReactNode } from "react";
import { mergeClasses } from "src/gui/classes";
import { listClasses } from "src/gui/import-wizard/listClasses";

type ListDividers = "top" | "bottom" | "none";

export interface ListProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly columns?: string[];
  readonly columnWidths?: string;
  readonly dividers?: ListDividers;
  readonly striped?: boolean;
}

function dividersClass(dividers: ListDividers): string | undefined {
  if (dividers === "top") {
    return listClasses.listDividersTop;
  }
  if (dividers === "bottom") {
    return listClasses.listDividersBottom;
  }
  return undefined;
}

export function List({
  columns,
  columnWidths,
  dividers = "bottom",
  striped = false,
  className,
  children,
}: ListProps): JSX.Element {
  return (
    <div
      className={mergeClasses(
        listClasses.list,
        dividersClass(dividers),
        striped ? listClasses.listStriped : undefined,
        className,
      )}
      style={columnWidths ? { gridTemplateColumns: columnWidths } : undefined}
    >
      {columns && columns.length > 0 && (
        <div className={listClasses.listHeader}>
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
