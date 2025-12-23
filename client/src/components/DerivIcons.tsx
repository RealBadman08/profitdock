import { ComponentProps } from "react";

export const DerivLogo = ({ className, ...props }: ComponentProps<"svg">) => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM13.8824 6.78442C13.8824 6.64932 13.8427 6.55169 13.7634 6.49156C13.6841 6.43144 13.5654 6.40137 13.4074 6.40137C13.2559 6.40137 13.134 6.43394 13.0415 6.49906C12.9491 6.56419 12.9029 6.66687 12.9029 6.80709V10.1415C12.2882 10.1114 11.6672 10.0964 11.0398 10.0964C9.50796 10.0964 8.08647 10.2242 6.77539 10.4799V6.80709C6.77539 6.66687 6.72917 6.56419 6.63674 6.49906C6.54432 6.43394 6.42232 6.40137 6.27078 6.40137C6.11281 6.40137 5.99408 6.43144 5.91465 6.49156C5.83522 6.55169 5.79551 6.64932 5.79551 6.78442V15.7197C5.79551 15.8548 5.83522 15.9525 5.91465 16.0126C5.99408 16.0727 6.11281 16.1028 6.27078 16.1028C6.42232 16.1028 6.54432 16.0702 6.63674 16.0051C6.72917 15.94 6.77539 15.8373 6.77539 15.6971V11.2372C7.94793 11.0569 9.36939 10.9667 11.0398 10.9667C11.6738 10.9667 12.2948 10.9792 12.9029 11.0043V17.0628C12.9029 17.5886 13.0579 17.9892 13.3678 18.2647C13.6777 18.5402 14.1527 18.6779 14.7928 18.6779C15.4262 18.6779 15.9012 18.5402 16.2177 18.2647C16.5342 17.9892 16.6925 17.5886 16.6925 17.0628V14.1329L17.7646 15.2045C17.8636 15.3047 17.989 15.3548 18.1407 15.3548C18.2991 15.3548 18.4277 15.3022 18.5267 15.1969C18.6256 15.0918 18.6751 14.9666 18.6751 14.8213C18.6751 14.7462 18.6619 14.6761 18.6355 14.611C18.6091 14.5459 18.5662 14.4858 18.5069 14.4307L14.7928 10.7032L14.4761 11.0262V6.78442H13.8824Z"
            fill="#ff444f"
        />
    </svg>
);

export const MenuHamburger = (props: ComponentProps<"svg">) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconCashier = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M17 9V7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7V9M3 13H21M5 13V19C5 20.6569 6.34315 22 8 22H16C17.6569 22 19 20.6569 19 19V13M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconReports = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M9 17V11M12 17V7M15 17V14M19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconHub = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconTrader = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 9l-5 5-4-4-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconBot = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v4" stroke="currentColor" strokeWidth="2" />
        <line x1="8" y1="16" x2="8" y2="16" stroke="currentColor" strokeWidth="2" />
        <line x1="16" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="2" />
    </svg>
);

// Trade Types
export const IconRiseFall = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M16 11l-4-4-4 4M12 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconDigits = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M4 10h16M4 14h16M7 10v4M17 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconMultipliers = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const IconOpen = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M4 6H20M4 12H20M4 18H20" stroke="none" />
        <path fillRule="evenodd" clipRule="evenodd" d="M19.9999 19.9999H3.99994V7.99991H6.82837L8.82837 5.99991H19.9999V19.9999ZM19.9999 3.99991H8.0001L6.0001 5.99991H3.99994C2.89537 5.99991 1.99994 6.89534 1.99994 7.99991V19.9999C1.99994 21.1045 2.89537 21.9999 3.99994 21.9999H19.9999C21.1045 21.9999 21.9999 21.1045 21.9999 19.9999V5.99991C21.9999 4.89534 21.1045 3.99991 19.9999 3.99991Z" fill="currentColor" />
    </svg>
);

export const IconSave = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path fillRule="evenodd" clipRule="evenodd" d="M17 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V7L17 3ZM19 19H5V5H16.1716L19 7.82843V19ZM12 18C13.6569 18 15 16.6569 15 15C15 13.3431 13.6569 12 12 12C10.3431 12 9 13.3431 9 15C9 16.6569 10.3431 18 12 18ZM6 6H14V9H6V6Z" fill="currentColor" />
    </svg>
);

export const IconPlay = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M8 5V19L19 12L8 5Z" fill="currentColor" />
    </svg>
);

export const IconStop = (props: ComponentProps<"svg">) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
    </svg>
);

// Compatibility Exports for Sidebar
export const IconDashboard = IconHub;
export const IconChart = IconTrader;
export const IconTutorials = IconReports;
