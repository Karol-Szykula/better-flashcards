import type { JSX } from "react";
import { mergeClasses } from "src/gui/classes";
import { footerClasses } from "src/gui/import-wizard/classes";

export interface FooterButton {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

export interface FooterProps {
  readonly className?: string;
  readonly leftButtons: FooterButton[];
  readonly pagination?: {
    readonly currentPage: number;
    readonly totalPages: number;
    readonly onPageChange: (page: number) => void;
  };
  readonly rightButtons: FooterButton[];
}

interface FooterButtonGroupProps {
  readonly buttons: FooterButton[];
}

function FooterButtonGroup({ buttons }: FooterButtonGroupProps) {
  return (
    <>
      {buttons.map((button) => (
        <button
          disabled={button.disabled ?? false}
          key={button.label}
          onClick={() => {
            if (!button.disabled) {
              button.onClick();
            }
          }}
        >
          {button.label}
        </button>
      ))}
    </>
  );
}

export function Footer({
  leftButtons,
  rightButtons,
  pagination,
  className,
}: FooterProps): JSX.Element {
  const isPaginationVisible = pagination && pagination.totalPages > 1;

  return (
    <div className={mergeClasses(footerClasses.footer, className)}>
      <div>
        <FooterButtonGroup buttons={leftButtons} />
      </div>
      {isPaginationVisible && (
        <div className={footerClasses.footerCenter}>
          <button
            disabled={pagination.currentPage === 0}
            onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
          >
            ← Prev
          </button>
          <span className={footerClasses.pageIndicator}>
            {pagination.currentPage + 1} / {pagination.totalPages}
          </span>
          <button
            disabled={pagination.currentPage >= pagination.totalPages - 1}
            onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
          >
            Next →
          </button>
        </div>
      )}
      <div className={footerClasses.footerRight}>
        <FooterButtonGroup buttons={rightButtons} />
      </div>
    </div>
  );
}
