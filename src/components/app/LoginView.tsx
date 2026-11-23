"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useBrandingStore, useShortSchoolName, useSchoolInitial } from "@/stores/branding-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Eye,
  EyeOff,
  BookOpen,
  Users,
  Shield,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);
  const schoolName = useBrandingStore((s) => s.schoolName);
  const motto = useBrandingStore((s) => s.motto);
  const address = useBrandingStore((s) => s.address);
  const shortName = useShortSchoolName();
  const initial = useSchoolInitial();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const ok = await login(email, password);
    if (ok) {
      toast.success("Welcome back!");
    } else {
      toast.error("Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] bg-primary relative overflow-hidden flex-col justify-between p-10 xl:p-14">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.07]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <span className="text-2xl font-bold text-white leading-none">{initial}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate" title={schoolName}>{shortName}</h1>
              <p className="text-sm text-white/70 truncate">
                {motto || address || "School Administration"}
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              School Administration
              <br />
              <span className="text-white/80">Made Simple</span>
            </h2>
            <p className="mt-4 text-white/60 text-base xl:text-lg max-w-md leading-relaxed">
              Manage students, track attendance, enter marks, generate reports — all in one place.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: <Users className="w-5 h-5" />, text: "Manage students, teachers & exams" },
              { icon: <BookOpen className="w-5 h-5" />, text: "Track attendance & exam performance" },
              { icon: <Shield className="w-5 h-5" />, text: "Secure role-based access control" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center text-white/90 flex-shrink-0">
                  {item.icon}
                </div>
                <p className="text-white/80 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-xs">&copy; {new Date().getFullYear()}{schoolName ? ` ${schoolName}` : ""}{address ? ` · ${address}` : ""}</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo - only visible on small screens */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground leading-none">{initial}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate" title={schoolName}>{shortName}</h1>
              <p className="text-xs text-muted-foreground">Administration System</p>
            </div>
          </div>

          <div className="space-y-1 mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Contact the school administrator if you need help accessing your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
