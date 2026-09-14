import type { JSX } from "react";
import {
  footerClasses,
  mergeClasses,
} from "src/gui/import-wizard/classes";

export interface FooterButton {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

export interface FooterProps {
  className?: string;
  leftButtons: FooterButton[];
  rightButtons: FooterButton[];
}

function FooterButtonGroup({ buttons }: { buttons: FooterButton[] }) {
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
  className,
}: FooterProps): JSX.Element {
  return (
    <div className={mergeClasses(footerClasses.footer, className)}>
      <div>
        <FooterButtonGroup buttons={leftButtons} />
      </div>
      <div className={footerClasses.footerRight}>
        <FooterButtonGroup buttons={rightButtons} />
      </div>
    </div>
  );
}
