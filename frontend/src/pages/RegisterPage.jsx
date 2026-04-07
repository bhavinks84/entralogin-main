import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { authService } from '../services/authService';

const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  givenName: z.string().max(100).optional(),
  surname: z.string().max(100).optional(),
});

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);

  const navigate  = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(registerSchema) });

  const onRegister = async (data) => {
    setLoading(true);
    try {
      const { data: result } = await authService.register(data);
      toast.success(result.message || 'Invitation sent. Check your email.');
      navigate('/login', { replace: true });
    } catch (err) {
      // Handle validation errors
      const errorData = err.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const errorMsg = errorData.errors.map(e => `${e.path}: ${e.msg}`).join(', ');
        toast.error(errorMsg);
      } else {
        toast.error(errorData?.error || 'Failed to send invitation');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-gray-900">Request access</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          You’ll receive a Microsoft invitation email to join as a guest.
        </p>

        <form onSubmit={handleSubmit(onRegister)} noValidate className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Full name</label>
            <input
              type="text"
              autoComplete="name"
              {...register('displayName')}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-600 focus:outline-none"
              placeholder="Jane Smith"
            />
            {errors.displayName && (
              <p className="mt-1 text-xs text-red-600">{errors.displayName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First name (optional)</label>
              <input
                type="text"
                autoComplete="given-name"
                {...register('givenName')}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-600 focus:outline-none"
                placeholder="Jane"
              />
              {errors.givenName && (
                <p className="mt-1 text-xs text-red-600">{errors.givenName.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Last name (optional)</label>
              <input
                type="text"
                autoComplete="family-name"
                {...register('surname')}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-600 focus:outline-none"
                placeholder="Smith"
              />
              {errors.surname && (
                <p className="mt-1 text-xs text-red-600">{errors.surname.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email address</label>
            <input
              type="email"
              autoComplete="email"
              {...register('email')}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-600 focus:outline-none"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? 'Sending invitation...' : 'Send invitation'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
