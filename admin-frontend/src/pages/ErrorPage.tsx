import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ code }: { code: '404' | '500' | '503' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="text-6xl font-bold tracking-tight text-muted-foreground/40">{code}</div>
      <h1 className="mt-4 text-2xl font-semibold">{t(`error.${code}.title`)}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t(`error.${code}.description`)}
      </p>
      <Button className="mt-6" onClick={() => void navigate('/')}>
        {t('common.backHome')}
      </Button>
    </div>
  );
}
