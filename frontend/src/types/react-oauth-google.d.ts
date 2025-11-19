import type { ReactNode } from 'react';

declare module '@react-oauth/google' {
  interface GoogleLoginRenderProps {
    render?: (props: { onClick: () => void; disabled: boolean }) => ReactNode;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export function GoogleLogin(
    props: GoogleLoginProps & GoogleLoginRenderProps
  ): JSX.Element;
}

