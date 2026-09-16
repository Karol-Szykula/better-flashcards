import type { JSX } from "react";
import {
  mergeClasses,
  pageIndicatorClasses,
} from "src/gui/import-wizard/classes";

export interface PageIndicatorProps {
  connectors?: boolean;
  currentPage: number;
  pages: string[];
}

export function PageIndicator({
  connectors = true,
  currentPage,
  pages,
}: PageIndicatorProps): JSX.Element {
  return (
    <div className={pageIndicatorClasses.pageIndicator}>
      {pages.map((title, index) => {
        const pageNumber = index + 1;
        const isActive = pageNumber === currentPage;
        const isDone = pageNumber < currentPage;
        return (
          <span
            className={mergeClasses(
              pageIndicatorClasses.page,
              isActive ? pageIndicatorClasses.pageActive : undefined,
              isDone ? pageIndicatorClasses.pageDone : undefined
            )}
            key={title}
          >
            <span className={pageIndicatorClasses.pageNumber}>
              {isDone ? "✓" : pageNumber}
            </span>
            <span>{title}</span>
            {connectors && pageNumber < pages.length && (
              <span className={pageIndicatorClasses.pageSeparator}>─</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
