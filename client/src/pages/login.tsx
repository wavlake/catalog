import React, { useContext, useState } from "react";
import TwitterIcon from "./../icons/twitter.svg";
import GoogleIcon from "./../icons/google.svg";
import { useForm } from "react-hook-form";
import { useAuthContext } from "@/auth/authContext";


const options = [
  {
    name: "Twitter",
    icon: TwitterIcon,
  },
  {
    name: "Google",
    icon: GoogleIcon,
  },
];

const ErrorMessage = ({ error }: any) => {
  return (
    <div className="text-red-500 text-sm">
      {error.message}
    </div>
  );
}

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);

  const { user, logInEmail } =
  useAuthContext();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm();

  async function handleEmail(data: any) {
    if (!logInEmail) return;
    if (!isRegistering) {
      logInEmail(data.email, data.password)
      .then((res: any) => {
      if (res.error) {
        // console.log(res)
        setError("password", {
          type: "fail",
          message: `Error: ${res.error}`,
        });
      }})
        .catch((e: any) =>
          setError("password", { type: "fail", message: `Error: ${e.error}` })
        )
    } else if (isRegistering) {
      // createEmailUser?(data.email, data.password)
      //   .then((res: any) => {
      //     if (res.error) {
      //       // console.log(res)
      //       setError("password", {
      //         type: "fail",
      //         message: `Error: ${res.error}`,
      //       });
      //     }
      //   })
      //   .catch((e) =>
      //     setError("password", { type: "fail", message: `Error: ${e.error}` })
      //   );
    }
  }

  function handleGoogleLogin() {
    // return logInGoogle();
  }

  function handleTwitterLogin() {
    // return logInTwitter();
  }

  function handleRegister() {
    setIsRegistering(true);
  }

  return (
    <>
      <div className="flex items-center justify-center mt-20 mx-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            {isRegistering ? (
              <>
                <h2 className="mt-6 text-center text-3xl font-normal tracking-tight text-gray-900">
                  Register a new account
                </h2>
              </>
            ) : (
              <>
                <h2 className="mt-6 text-center text-3xl font-normal tracking-tight text-gray-900">
                  Sign in to your account
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                  Or{" "}
                  <a
                    href="#"
                    className="font-medium text-brand-pink hover:text-brand-pink-dark"
                    // TODO: Magic email link for new users
                    onClick={() => handleRegister()}
                  >
                    Register
                  </a>
                </p>
              </>
            )}
          </div>

          <form
            onSubmit={handleSubmit((data) => handleEmail(data))}
            encType="multipart/form-data"
            className="mt-8 space-y-6"
          >
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-6">
                <label className="block text-md font-medium text-gray-700">
                  Email
                </label>
                <input
                  {...register("email", {
                    required: true,
                    pattern: {
                      value:
                        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                      message: "Please enter a valid email",
                    },
                  })}
                  className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-brand-pink focus:ring-brand-pink focus:outline-none sm:text-sm"
                />
                {errors.email && <ErrorMessage error={errors.email} />}
              </div>

              <div className="col-span-6">
                <label className="block text-md font-medium text-gray-700">
                  Password
                </label>
                <input
                  {...register("password", {
                    required: true,
                    minLength: {
                      value: 6,
                      message: "Password must be at least 6 characters",
                    },
                  })}
                  type="password"
                  className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-brand-pink focus:ring-brand-pink focus:outline-none sm:text-sm"
                />
                {errors.password && <ErrorMessage error={errors.password} />}
              </div>

              {isRegistering && (
                <div className="col-span-6">
                  <label className="block text-md font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <input
                    {...register("confirmPassword", {
                      required: true,
                      validate: (value) => {
                        if (watch("password") != value) {
                          return "Passwords do not match!";
                        }
                      },
                    })}
                    type="password"
                    className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-brand-pink focus:ring-brand-pink focus:outline-none sm:text-sm"
                  />
                  {errors.confirmPassword && <ErrorMessage error={errors.confirmPassword} />}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                name="Submit"
                className="bg-brand-black text-white py-2 px-4 rounded-xl"
              >
                {isRegistering ? `Register` : `Submit`}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="flex min-h-full items-center justify-center mb-20 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-4 justify-center">
          <div className="flex justify-around">
            <h2 className="mt-6 text-center text-xl font-normal tracking-tight text-gray-900">
              or continue with
            </h2>
          </div>
          <div className="grid grid-cols-1 items-center justify-items-center space-y-2">
            {options.map((item) => (
              <div
                className="grid grid-cols-2 items-center justify-items-center bg-brand-black rounded-lg w-44 py-3 pr-4 cursor-pointer"
                key={item.name}
                onClick={() => {
                  switch (item.name) {
                    case "Twitter": {
                      handleTwitterLogin();
                      break;
                    }
                    case "Google": {
                      handleGoogleLogin();
                      break;
                    }
                  }
                }}
              >
                <item.icon className="col-start-1 h-5 fill-brand-beige" />
                <div className="">
                  <p className="col-start-2 text-brand-beige">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
