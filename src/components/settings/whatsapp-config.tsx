'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';
import { fetchWithTimeout } from '@/lib/http';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  const loadHealth = useCallback(async () => {
    const res = await fetchWithTimeout('/api/whatsapp/config', {
      method: 'GET',
    });
    const payload = await res.json().catch(() => ({}));

    if (payload.connected) {
      setConnectionStatus('connected');
      setResetReason(null);
      setStatusMessage(
        payload.phone_info?.verified_name
          ? `Verified with Meta as ${payload.phone_info.verified_name}.`
          : 'Credentials verified with Meta.'
      );
      return true;
    }

    setConnectionStatus('disconnected');
    setResetReason(
      payload.needs_reset
        ? 'token_corrupted'
        : payload.reason === 'meta_api_error'
          ? 'meta_api_error'
          : null
    );
    setStatusMessage(payload.message || 'Meta credentials are not connected.');
    return false;
  }, []);

  const fetchConfig = useCallback(
    async (acctId: string) => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', acctId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data) {
          setConfig(data);
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setTokenEdited(false);
          await loadHealth();
        } else {
          setConfig(null);
          setPhoneNumberId('');
          setWabaId('');
          setAccessToken('');
          setTokenEdited(false);
          setConnectionStatus('disconnected');
          setResetReason(null);
          setStatusMessage('No Meta maintenance credentials are saved yet.');
        }
      } catch (err) {
        console.error('Failed to load WhatsApp maintenance config:', err);
        toast.error('Failed to load Meta maintenance settings');
        setConnectionStatus('disconnected');
      } finally {
        setLoading(false);
      }
    },
    [loadHealth]
  );

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    void fetchConfig(accountId);
  }, [accountId, authLoading, fetchConfig, profileLoading, user]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!accessToken.trim() || accessToken === MASKED_TOKEN || !tokenEdited) {
      toast.error('Re-enter the Meta access token before saving');
      return;
    }

    try {
      setSaving(true);
      const res = await fetchWithTimeout('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim() || null,
          access_token: accessToken.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      toast.success(
        data.phone_info?.verified_name
          ? `Meta credentials saved for ${data.phone_info.verified_name}`
          : 'Meta maintenance credentials saved'
      );
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const ok = await loadHealth();
      toast[ok ? 'success' : 'error'](
        ok ? 'Meta credentials are valid' : 'Meta credentials need review'
      );
    } catch (err) {
      console.error('Meta maintenance check failed:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (
      !confirm(
        'This clears the saved Meta maintenance credentials for the dashboard. n8n production workflows are not changed. Continue?'
      )
    ) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetchWithTimeout('/api/whatsapp/config', {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      toast.success('Meta maintenance credentials cleared');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('No Meta maintenance credentials are saved yet.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reset failed';
      toast.error(message);
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  const connected = connectionStatus === 'connected';
  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Alert className="border-sky-500/30 bg-sky-500/10">
          <AlertTriangle className="size-4 text-sky-300" />
          <AlertTitle className="text-sky-100">
            n8n owns live WhatsApp routing
          </AlertTitle>
          <AlertDescription className="text-sky-100/80">
            Keep Meta inbound webhooks, WhatsApp Flow data exchange, payments,
            reminders, Supabase setup reads, and bot routing pointed at the live
            n8n workflows. These credentials are only for dashboard template
            maintenance and approved template sends.
          </AlertDescription>
        </Alert>

        {showResetBanner ? (
          <Alert className="border-amber-600/40 bg-amber-950/40">
            <AlertTriangle className="size-4 text-amber-400" />
            <AlertTitle className="text-amber-200">
              Stored token cannot be decrypted
            </AlertTitle>
            <AlertDescription className="text-amber-100/80">
              {statusMessage}
            </AlertDescription>
            <Button
              onClick={handleReset}
              disabled={resetting}
              size="sm"
              className="text-foreground mt-3 bg-amber-600 hover:bg-amber-700"
            >
              {resetting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Reset Credentials
            </Button>
          </Alert>
        ) : null}

        <Alert className="border-border bg-card">
          {connected ? (
            <CheckCircle2 className="text-primary size-4" />
          ) : (
            <AlertTriangle className="size-4 text-amber-400" />
          )}
          <AlertTitle className="text-foreground">
            {connected
              ? 'Meta maintenance ready'
              : 'Meta maintenance not ready'}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            {statusMessage ||
              'Save a valid Phone Number ID and access token to use template maintenance.'}
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Meta Credentials</CardTitle>
            <CardDescription className="text-muted-foreground">
              Used by Settings / Templates and out-of-window template sends.
              Text replies continue through n8n-owned mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-number-id" className="text-foreground/80">
                Phone Number ID
              </Label>
              <Input
                id="phone-number-id"
                value={phoneNumberId}
                onChange={(event) => setPhoneNumberId(event.target.value)}
                placeholder="1175796395607450"
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="waba-id" className="text-foreground/80">
                WhatsApp Business Account ID
              </Label>
              <Input
                id="waba-id"
                value={wabaId}
                onChange={(event) => setWabaId(event.target.value)}
                placeholder="WABA ID used for template sync"
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="access-token" className="text-foreground/80">
                Meta Access Token
              </Label>
              <div className="relative">
                <Input
                  id="access-token"
                  type={showToken ? 'text' : 'password'}
                  value={accessToken}
                  onChange={(event) => {
                    setAccessToken(event.target.value);
                    setTokenEdited(true);
                  }}
                  placeholder="EAAG..."
                  className="border-border bg-muted text-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((value) => !value)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                  aria-label={
                    showToken ? 'Hide access token' : 'Show access token'
                  }
                >
                  {showToken ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {config ? (
                <p className="text-muted-foreground text-xs">
                  Re-enter the token before saving changes. Tokens are encrypted
                  server-side.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Save Credentials
              </Button>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || !config}
                className="border-border text-foreground/80 hover:bg-muted bg-transparent"
              >
                <RefreshCw
                  className={testing ? 'size-4 animate-spin' : 'size-4'}
                />
                Test
              </Button>
              {config ? (
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={resetting}
                  className="border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10"
                >
                  {resetting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Clear
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-foreground">What Belongs Here</CardTitle>
          <CardDescription className="text-muted-foreground">
            The production WhatsApp concierge lives in n8n. This panel is only
            the dashboard&apos;s Meta maintenance keyring.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4 text-sm">
          <div>
            <p className="text-foreground font-medium">Keep in n8n</p>
            <p className="mt-1">
              Inbound webhook, Flow data endpoint, booking/payment routing,
              reminders, owner digest, Calendar, Gmail, and Supabase setup
              reads.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium">Use here</p>
            <p className="mt-1">
              Template sync, template approval maintenance, and approved
              template sends when the 24-hour WhatsApp session has expired.
            </p>
          </div>
          <a
            href="https://business.facebook.com/wa/manage/message-templates/"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary/80 inline-flex items-center gap-2"
          >
            Open Meta templates
            <ExternalLink className="size-4" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
