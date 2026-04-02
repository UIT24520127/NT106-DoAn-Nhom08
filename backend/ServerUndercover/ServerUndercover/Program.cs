using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Firebase.Auth;
using Firebase.Auth.Providers;

var builder = WebApplication.CreateBuilder(args);

// 1. Đăng ký Controller
builder.Services.AddControllers();

// 2. BẬT LẠI SWAGGER (Rất quan trọng để biết Port)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 3. Cấu hình CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowNextJs", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// 4. Cấu hình Firebase
var config = new FirebaseAuthConfig
{
    ApiKey = "AIzaSyDjYibTklIP4LZHn5JleaQsY6ut5qzSfJs",
    AuthDomain = "game-undercover-d70dd.firebaseapp.com",
    Providers = new FirebaseAuthProvider[] { new EmailProvider() }
};

var authClient = new FirebaseAuthClient(config);
// Ép kiểu rõ ràng cho Dependency Injection để AuthController nhận diện được
builder.Services.AddSingleton<FirebaseAuthClient>(authClient);

var app = builder.Build();

// ============ KHU VỰC CẤU HÌNH PIPELINE ============

// Kích hoạt giao diện Swagger
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("AllowNextJs");
app.MapControllers();

app.Run();