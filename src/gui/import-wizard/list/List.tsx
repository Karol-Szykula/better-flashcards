import type { JSX, ReactNode } from "react";
import { listClasses } from "src/gui/import-wizard/listClasses";
import { mergeClasses } from "src/gui/import-wizard/classes";

export type ListDividers = "top" | "bottom" | "none";

export interface ListProps {
  children: ReactNode;
  className?: string;
  columns?: string[];
  columnWidths?: string;
  dividers?: ListDividers;
  striped?: boolean;
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
        className
      )}
      style={
        columnWidths ? { gridTemplateColumns: columnWidths } : undefined
      }
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
