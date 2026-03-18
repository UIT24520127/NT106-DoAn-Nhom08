using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Firebase.Auth;
using Firebase.Auth.Providers;
using System;
using System.Threading.Tasks;

var builder = WebApplication.CreateBuilder(args);

// 1. Cấu hình CORS để cho phép Front-end (Next.js) gọi API tới đây mà không bị chặn
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowNextJs", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// 2. Cấu hình Firebase Authentication (Giữ nguyên các Key của bạn)
var config = new FirebaseAuthConfig
{
    ApiKey = "AIzaSyDjYibTklIP4LZHn5JleaQsY6ut5qzSfJs",
    AuthDomain = "game-undercover-d70dd.firebaseapp.com",
    Providers = new FirebaseAuthProvider[] { new EmailProvider() }
};

// Đăng ký authClient dạng Singleton để server dùng chung
var authClient = new FirebaseAuthClient(config);
builder.Services.AddSingleton(authClient);

var app = builder.Build();

// Kích hoạt CORS
app.UseCors("AllowNextJs");


// =================================================================
// API ENDPOINT 1: ĐĂNG KÝ HỒ SƠ (Dùng Email thật)
// =================================================================
app.MapPost("/api/register", async (AuthRequest request, FirebaseAuthClient client) =>
{
    // Kiểm tra dữ liệu Front-end gửi lên có bị trống không
    if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
    {
        return Results.BadRequest(new { message = "Email và mật khẩu không được để trống!" });
    }

    try
    {
        // Yêu cầu Firebase tạo tài khoản bằng Email thật và Password
        await client.CreateUserWithEmailAndPasswordAsync(request.Email, request.Password);

        // NOTE: Hiện tại Firebase Auth chỉ lưu Email và Password. 
        // Sau này nếu muốn lưu thêm "Username" (Tên trong game), chúng ta sẽ code thêm phần lưu vào Firestore ở đây.

        return Results.Ok(new { message = "Đăng ký thành công! Hãy quay lại trang đăng nhập." });
    }
    catch (Exception)
    {
        return Results.BadRequest(new { message = "Email này đã được sử dụng hoặc định dạng không hợp lệ!" });
    }
});


// =================================================================
// API ENDPOINT 2: ĐĂNG NHẬP
// =================================================================
app.MapPost("/api/login", async (AuthRequest request, FirebaseAuthClient client) =>
{
    if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
    {
        return Results.BadRequest(new { message = "Vui lòng nhập đầy đủ Email và Mật khẩu!" });
    }

    try
    {
        // Yêu cầu Firebase kiểm tra đăng nhập bằng Email thật
        var result = await client.SignInWithEmailAndPasswordAsync(request.Email, request.Password);

        return Results.Ok(new
        {
            message = "Đăng nhập thành công!",
            token = await result.User.GetIdTokenAsync() // Trả về Token để Front-end dùng nếu cần
        });
    }
    catch (Exception)
    {
        return Results.BadRequest(new { message = "Sai Email hoặc Mật khẩu! Vui lòng kiểm tra lại." });
    }
});

app.Run();


// =================================================================
// KHAI BÁO CẤU TRÚC DỮ LIỆU (Gói hàng) NHẬN TỪ NEXT.JS
// =================================================================
public record AuthRequest(string Email, string Username, string Password);