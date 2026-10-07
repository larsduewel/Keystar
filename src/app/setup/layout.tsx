import { ToastProvider } from "@/components/ui/toast";

/** The setup walkthrough sits outside the app layout; its steps report refusals in toasts. */
export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  return <ToastProvider>{children}</ToastProvider>;
}
