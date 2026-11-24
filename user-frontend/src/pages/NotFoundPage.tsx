import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="font-mono text-5xl font-bold text-muted-foreground">404</div>
      <Button type="button" asChild>
        <Link to="/dashboard">{t('nav.dashboard')}</Link>
      </Button>
    </div>
  );
}
