import { toast } from 'sonner';
import i18n from '@/i18n';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(i18n.t('common.copied'));
    return true;
  } catch {
    toast.error(i18n.t('common.copyFailed'));
    return false;
  }
}
