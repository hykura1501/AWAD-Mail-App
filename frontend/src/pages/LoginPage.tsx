import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useAppDispatch } from "@/store/hooks";
import { setUser } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { GOOGLE_CLIENT_ID } from "@/config/api";
import { useState } from "react";
import { Mail, AlertCircle, Server } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const imapLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  imapServer: z.string().min(1, "IMAP server is required"),
  imapPort: z
    .string()
    .regex(/^\d+$/, "Port must be a number")
    .transform(Number),
});

type LoginFormData = z.infer<typeof loginSchema>;
type ImapLoginFormData = z.infer<typeof imapLoginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<"normal" | "imap">("normal");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerImap,
    handleSubmit: handleSubmitImap,
    formState: { errors: errorsImap, isSubmitting: isSubmittingImap },
  } = useForm<ImapLoginFormData>({
    resolver: zodResolver(imapLoginSchema),
    defaultValues: {
      imapPort: 993,
    },
  });

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      toast.success("Đăng nhập thành công!");
      dispatch(setUser(data.user));
      navigate("/inbox");
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage =
        error.response?.data?.error ||
        "Email hoặc mật khẩu không đúng. Vui lòng thử lại.";
      setError(errorMessage);
      toast.error(errorMessage);
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    loginMutation.mutate(data);
  };

  const imapLoginMutation = useMutation({
    mutationFn: authService.imapLogin,
    onSuccess: (data) => {
      toast.success("Đăng nhập IMAP thành công!");
      dispatch(setUser(data.user));
      navigate("/inbox");
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage =
        error.response?.data?.error ||
        "Không thể kết nối đến máy chủ IMAP. Vui lòng kiểm tra lại thông tin.";
      setError(errorMessage);
      toast.error(errorMessage);
    },
  });

  const onSubmitImap = async (data: ImapLoginFormData) => {
    setError(null);
    imapLoginMutation.mutate(data);
  };

  const googleLogin = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async (codeResponse) => {
      setError(null);
      const loadingToast = toast.loading("Đang đăng nhập với Google...");
      try {
        console.log("Google Sign-In response:", codeResponse);
        const data = await authService.googleSignIn({
          code: codeResponse.code,
          scope: codeResponse.scope ? codeResponse.scope.split(" ") : [],
        });
        toast.success("Đăng nhập thành công!", { id: loadingToast });
        dispatch(setUser(data.user));
        navigate("/inbox");
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        const errorMessage =
          error.response?.data?.error ||
          "Đăng nhập Google thất bại. Vui lòng thử lại.";
        setError(errorMessage);
        toast.error(errorMessage, { id: loadingToast });
      }
    },
    onError: () => {
      const errorMessage = "Đăng nhập Google thất bại. Vui lòng thử lại.";
      setError(errorMessage);
      toast.error(errorMessage);
    },
    scope:
      "email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify",
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="relative">
            <Mail className="h-8 w-8 text-blue-400" />
            <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
              <div className="h-2 w-2 bg-white rounded-full"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">InboxFlow</h1>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Sign in to your account
          </h2>
          <p className="text-gray-400">
            Enter your credentials to access your dashboard.
          </p>
        </div>

        {/* Login Card */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            {/* Login Mode Toggle */}
            <div className="flex gap-2 mb-6 p-1 bg-gray-700 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setLoginMode("normal");
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  loginMode === "normal"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Mail className="h-4 w-4" />
                <span>Email & Password</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMode("imap");
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  loginMode === "imap"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Server className="h-4 w-4" />
                <span>IMAP</span>
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {loginMode === "normal" ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-200">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    {...register("email")}
                    disabled={isSubmitting}
                    className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errors.email && (
                    <p className="text-sm text-red-400">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-gray-200">
                      Password
                    </Label>
                    <Link
                      to="#"
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    {...register("password")}
                    disabled={isSubmitting}
                    className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errors.password && (
                    <p className="text-sm text-red-400">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Signing In...</span>
                    </div>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={handleSubmitImap(onSubmitImap as any)}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="imap-email" className="text-gray-200">
                    Email Address
                  </Label>
                  <Input
                    id="imap-email"
                    type="email"
                    placeholder="you@example.com"
                    {...registerImap("email")}
                    disabled={isSubmittingImap}
                    className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errorsImap.email && (
                    <p className="text-sm text-red-400">
                      {errorsImap.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imap-password" className="text-gray-200">
                    Password
                  </Label>
                  <Input
                    id="imap-password"
                    type="password"
                    placeholder="••••••••"
                    {...registerImap("password")}
                    disabled={isSubmittingImap}
                    className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {errorsImap.password && (
                    <p className="text-sm text-red-400">
                      {errorsImap.password.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="imap-server" className="text-gray-200">
                      IMAP Server
                    </Label>
                    <Input
                      id="imap-server"
                      type="text"
                      placeholder="imap.gmail.com"
                      {...registerImap("imapServer")}
                      disabled={isSubmittingImap}
                      className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                    />
                    {errorsImap.imapServer && (
                      <p className="text-sm text-red-400">
                        {errorsImap.imapServer.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="imap-port" className="text-gray-200">
                      Port
                    </Label>
                    <Input
                      id="imap-port"
                      type="text"
                      placeholder="993"
                      {...registerImap("imapPort")}
                      disabled={isSubmittingImap}
                      className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                    />
                    {errorsImap.imapPort && (
                      <p className="text-sm text-red-400">
                        {errorsImap.imapPort.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-300">
                    <strong>Common IMAP Servers:</strong>
                    <br />
                    Gmail: imap.gmail.com (993)
                    <br />
                    Outlook: outlook.office365.com (993)
                    <br />
                    Yahoo: imap.mail.yahoo.com (993)
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5"
                  disabled={isSubmittingImap}
                >
                  {isSubmittingImap ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Connecting...</span>
                    </div>
                  ) : (
                    "Connect via IMAP"
                  )}
                </Button>
              </form>
            )}

            {loginMode === "normal" && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-gray-800 px-2 text-gray-400">
                      Or continue with
                    </span>
                  </div>
                </div>

                <div className="flex justify-center">
                  {GOOGLE_CLIENT_ID ? (
                    <Button
                      type="button"
                      onClick={() => googleLogin()}
                      className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium py-2.5 flex items-center justify-center gap-2 border border-gray-300"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Sign in with Google
                    </Button>
                  ) : (
                    <div className="w-full p-3 text-sm text-gray-400 bg-gray-700 rounded-lg text-center border border-gray-600">
                      Google Sign-In is not configured. Please set
                      VITE_GOOGLE_CLIENT_ID in your .env file.
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex justify-center pt-6 border-t border-gray-700">
            <p className="text-sm text-gray-400">
              Don't have an account?{" "}
              <Link
                to="/signup"
                className="text-blue-400 hover:text-blue-300 hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
