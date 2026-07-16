import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TrendingUp, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type AuthFormData = z.infer<typeof authSchema>;
type AuthMode = 'login' | 'signup' | 'forgot' | 'update-password';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, passwordRecovery, signIn, signUp, resetPassword, updatePassword, clearPasswordRecovery } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<AuthMode>(
    searchParams.get('mode') === 'update-password' ? 'update-password' : 'login',
  );
  const [isLoading, setIsLoading] = useState(false);

  // Forgot-password form state
  const [forgotEmail, setForgotEmail] = useState('');
  // Update-password form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const form = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // When the user arrives from a recovery email link, Supabase signs them in
  // and fires PASSWORD_RECOVERY — switch to the set-new-password form.
  useEffect(() => {
    if (passwordRecovery) {
      setMode('update-password');
    }
  }, [passwordRecovery]);

  if (user && mode !== 'update-password') {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(data.email, data.password);
        if (error) {
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            toast({
              variant: 'destructive',
              title: 'Connection error',
              description: 'Unable to connect to the server. Please check your internet connection and try again.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign in failed',
              description: error.message,
            });
          }
        }
      } else {
        const { error } = await signUp(data.email, data.password);
        if (error) {
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            toast({
              variant: 'destructive',
              title: 'Connection error',
              description: 'Unable to connect to the server. Please check your internet connection and try again.',
            });
          } else if (error.message.includes('already registered')) {
            toast({
              variant: 'destructive',
              title: 'Account exists',
              description: 'An account with this email already exists. Please sign in instead.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign up failed',
              description: error.message,
            });
          }
        } else {
          toast({
            title: 'Account created!',
            description: 'You can now sign in with your credentials.',
          });
          setMode('login');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsLoading(true);
    try {
      const { error } = await resetPassword(forgotEmail);
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Could not send reset email',
          description: error.message,
        });
      } else {
        toast({
          title: 'Check your email',
          description: `We sent a password reset link to ${forgotEmail}.`,
        });
        setMode('login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'Please enter the same password in both fields.',
      });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Could not update password',
          description: error.message,
        });
      } else {
        toast({
          title: 'Password updated',
          description: 'You are signed in with your new password.',
        });
        clearPasswordRecovery();
        navigate('/dashboard', { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const titles: Record<AuthMode, { title: string; description: string }> = {
    login: { title: 'Welcome back', description: 'Sign in to access your trading journal' },
    signup: { title: 'Create your account', description: 'Start tracking your trades professionally' },
    forgot: { title: 'Reset your password', description: 'Enter your account email and we will send you a reset link' },
    'update-password': { title: 'Set a new password', description: 'Choose a new password for your account' },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md animate-scale-in relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-glow">
              <TrendingUp className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">{titles[mode].title}</CardTitle>
            <CardDescription className="mt-2">{titles[mode].description}</CardDescription>
          </div>
        </CardHeader>

        {mode === 'forgot' && (
          <form onSubmit={onForgotSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Back to sign in
              </button>
            </CardFooter>
          </form>
        )}

        {mode === 'update-password' && (
          <form onSubmit={onUpdatePasswordSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {!user && (
                <p className="text-sm text-muted-foreground">
                  Open this page from the link in your reset email so we can verify it's you.
                </p>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading || !user}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Back to sign in
              </button>
            </CardFooter>
          </form>
        )}

        {(mode === 'login' || mode === 'signup') && (
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...form.register('password')}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-primary hover:underline font-medium"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
