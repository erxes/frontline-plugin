import { CopyText } from 'erxes-ui';

/** The line that loads an embed's script from `scriptUrl`. */
export const scriptTag = (scriptUrl: string) =>
  `<script type="module" src="${scriptUrl}"></script>`;

/** Code a website pastes to show an embed, copied with a click. */
export const InstallCode = ({ code, label }: { code: string; label: string }) => (
  <CopyText value={code}>
    <code
      aria-label={label}
      className="block rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap"
    >
      {code}
    </code>
  </CopyText>
);
