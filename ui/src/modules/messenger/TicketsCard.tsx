import { Checkbox, Form, Label } from 'erxes-ui';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useChoices } from '@/tickets/queries.ts';
import { SettingsCard } from '~/shared/Settings.tsx';
import type { MessengerForm } from './queries.ts';

/** The pipelines of the messenger's channel its visitors file tickets in, each a checkbox. */
export const TicketsCard = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();
  const pipelines = useChoices().pipelines.filter((pipeline) => pipeline.channelId === channelId);

  return (
    <SettingsCard
      title={t('messenger-tickets', 'Tickets')}
      description={t(
        'messenger-tickets-description',
        'Visitors who left an email or phone file tickets in the pipelines you tick, and follow them in the messenger.',
      )}
    >
      <Form.Field
        control={control}
        name="ticketPipelineIds"
        render={({ field }) => (
          <Form.Item className="sm:col-span-2">
            {pipelines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('messenger-no-pipelines', 'This channel has no pipelines yet.')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pipelines.map((pipeline) => (
                  <li key={pipeline.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`ticket-pipeline-${pipeline.id}`}
                      checked={field.value.includes(pipeline.id)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, pipeline.id]
                            : field.value.filter((id) => id !== pipeline.id),
                        )
                      }
                    />
                    <Label htmlFor={`ticket-pipeline-${pipeline.id}`}>{pipeline.name}</Label>
                  </li>
                ))}
              </ul>
            )}
            <Form.Message />
          </Form.Item>
        )}
      />
    </SettingsCard>
  );
};
